import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, bogota, createUser, freshDb, nextWeekday } from "./db";

const DUENO = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";
const SECRET = "secreto-de-prueba";

let db: PGlite;
let biz: string;
let corte: string;
let barba: string;
let esparza: string;

async function q<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  return (await as(db, user, () => db.query<T>(sql, params))).rows;
}

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, DUENO, "esparza@test.local");
  await createUser(db, OTRO, "otro@test.local");
  await db.query("insert into private.app_config values ('app_secret_sha256', encode(sha256(convert_to($1, 'UTF8')), 'hex'))", [SECRET]);
  biz = (await q<{ id: string }>(DUENO, "select public.create_business('Barbería', 'barberia-x', 'barberia', 'Esparza') as id"))[0].id;
  const svc = await db.query<{ id: string; name: string }>("select id, name from public.services where business_id = $1", [biz]);
  corte = svc.rows.find((s) => s.name === "Corte clásico")!.id;
  barba = svc.rows.find((s) => s.name === "Arreglo de barba")!.id;
  esparza = (await db.query<{ id: string }>("select id from public.resources where business_id = $1", [biz])).rows[0].id;
});

const book = (service: string, at: string, phone = "3001112233", name = "Juan Pérez", source = "web") =>
  q<{ appointment_id: string; cancel_token: string; resource_name: string }>(
    null,
    "select * from public.create_booking($1, $2, $3, $4, $5, null, null, $6)",
    [biz, service, at, name, phone, source],
  ).then((r) => r[0]);

async function addBarber(name: string) {
  const id = (await db.query<{ id: string }>("insert into public.resources (business_id, name) values ($1, $2) returning id", [biz, name])).rows[0].id;
  await db.query("insert into public.working_hours (business_id, resource_id, weekday, start_time, end_time) values ($1, $2, 1, '09:00', '18:00')", [biz, id]);
  return id;
}

describe("qué barbero hace qué", () => {
  it("si un servicio tiene barberos asignados, solo ellos ofrecen horas", async () => {
    const andres = await addBarber("Andrés");
    const lunes = nextWeekday(1, 2);
    const before = await q<{ resource_name: string }>(null, "select * from public.get_available_slots($1, $2, $3)", [biz, barba, lunes]);
    expect(new Set(before.map((s) => s.resource_name))).toEqual(new Set(["Esparza", "Andrés"]));

    await q(DUENO, "insert into public.resource_services (business_id, resource_id, service_id) values ($1, $2, $3)", [biz, andres, barba]);
    const after = await q<{ resource_name: string }>(null, "select * from public.get_available_slots($1, $2, $3)", [biz, barba, lunes]);
    expect(new Set(after.map((s) => s.resource_name))).toEqual(new Set(["Andrés"]));
    // los demás servicios siguen con todos
    const corteSlots = await q<{ resource_name: string }>(null, "select * from public.get_available_slots($1, $2, $3)", [biz, corte, lunes]);
    expect(new Set(corteSlots.map((s) => s.resource_name)).size).toBe(2);
  });
});

describe("clientes e historial", () => {
  it("cada reserva crea o actualiza el cliente por teléfono", async () => {
    const lunes = nextWeekday(1, 2);
    await book(corte, bogota(lunes, "09:00"), "300 111 2233", "Juan");
    await book(corte, bogota(lunes, "10:00"), "3001112233", "Juan Pérez", "bot");
    const c = await q<{ name: string; n: number }>(
      DUENO,
      "select c.name, (select count(*)::int from public.appointments a where a.customer_id = c.id) n from public.customers c",
    );
    expect(c).toEqual([{ name: "Juan Pérez", n: 2 }]);
    const src = await db.query<{ source: string }>("select source from public.appointments where business_id = $1 order by starts_at", [biz]);
    expect(src.rows.map((r) => r.source)).toEqual(["web", "bot"]);
  });

  it("un visitante no puede marcar su reserva como hecha por el dueño", async () => {
    await expect(book(corte, bogota(nextWeekday(1, 2), "09:00"), "3001112233", "Juan", "owner")).rejects.toThrow("INVALID_SOURCE");
  });

  it("otro dueño no ve mis clientes", async () => {
    await book(corte, bogota(nextWeekday(1, 2), "09:00"));
    expect(await q(OTRO, "select * from public.customers")).toHaveLength(0);
    await expect(q(null, "select * from public.customers")).rejects.toThrow(/permission denied/);
  });
});

describe("cita manual del dueño", () => {
  it("puede anotar fuera del horario y sin teléfono, pero nunca cruzada", async () => {
    const lunes = nextWeekday(1, 2);
    const fuera = bogota(lunes, "19:30");
    const id = await q<{ id: string }>(DUENO, "select public.owner_create_booking($1, $2, $3, $4, 'Walk-in') as id", [biz, corte, esparza, fuera]);
    expect(id[0].id).toBeTruthy();
    const row = await db.query<{ status: string; customer_phone: string | null; source: string }>(
      "select status, customer_phone, source from public.appointments where id = $1", [id[0].id]);
    expect(row.rows[0]).toEqual({ status: "confirmed", customer_phone: null, source: "owner" });

    await expect(
      q(DUENO, "select public.owner_create_booking($1, $2, $3, $4, 'Otro')", [biz, corte, esparza, bogota(lunes, "19:45")]),
    ).rejects.toThrow("SLOT_TAKEN");
    await expect(
      q(OTRO, "select public.owner_create_booking($1, $2, $3, $4, 'Intruso')", [biz, corte, esparza, bogota(lunes, "08:00")]),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("lista de espera", () => {
  it("el cliente se anota sin duplicarse y solo el dueño la ve", async () => {
    const lunes = nextWeekday(1, 2);
    const a = await q<{ id: string }>(null, "select public.join_waitlist($1, $2, $3, 'Ana', '3005556677') as id", [biz, corte, lunes]);
    const b = await q<{ id: string }>(null, "select public.join_waitlist($1, $2, $3, 'Ana', '300 555 6677') as id", [biz, corte, lunes]);
    expect(a[0].id).toBe(b[0].id);
    await expect(q(null, "select * from public.waitlist")).rejects.toThrow(/permission denied/);
    expect(await q(DUENO, "select * from public.waitlist")).toHaveLength(1);
    expect(await q(OTRO, "select * from public.waitlist")).toHaveLength(0);
    await expect(q(null, "select public.join_waitlist($1, $2, '2020-01-01', 'Ana', '3005556677')", [biz, corte])).rejects.toThrow("INVALID_DATE");
  });
});

describe("mensualidades", () => {
  async function setupMembership() {
    const plan = (await q<{ id: string }>(DUENO,
      "insert into public.plans (business_id, name, price, visits_per_period) values ($1, 'Plan 4 cortes', 60000, 4) returning id", [biz]))[0].id;
    await q(DUENO, "insert into public.plan_services (plan_id, service_id, business_id) values ($1, $2, $3)", [plan, corte, biz]);
    const cust = (await q<{ id: string }>(DUENO,
      "insert into public.customers (business_id, phone, name) values ($1, '3001112233', 'Juan Pérez') returning id", [biz]))[0].id;
    const m = (await q<{ id: string }>(DUENO,
      "insert into public.memberships (business_id, plan_id, customer_id, starts_on) values ($1, $2, $3, current_date) returning id",
      [biz, plan, cust]))[0].id;
    return { plan, cust, m };
  }

  it("registrar el pago deja la mensualidad al día por un mes y cuenta las visitas del plan", async () => {
    const { m } = await setupMembership();
    let ov = await q<{ is_paid: boolean; visits_used: number }>(DUENO, "select * from public.membership_overview($1)", [biz]);
    expect(ov[0].is_paid).toBe(false);

    const until = await q<{ d: string }>(DUENO, "select public.register_membership_payment($1, 60000, 'nequi')::text as d", [m]);
    const expected = await db.query<{ d: string }>("select ((((now() at time zone 'America/Bogota')::date) + interval '1 month')::date)::text as d");
    expect(until[0].d).toBe(expected.rows[0].d);

    const lunes = nextWeekday(1, 2);
    await book(corte, bogota(lunes, "09:00"));
    await book(barba, bogota(lunes, "11:00")); // no está en el plan
    ov = await q(DUENO, "select * from public.membership_overview($1)", [biz]);
    expect(ov[0]).toMatchObject({ is_paid: true, visits_used: 1, visits_limit: 4, plan_name: "Plan 4 cortes" });

    await expect(q(OTRO, "select * from public.membership_overview($1)", [biz])).rejects.toThrow("FORBIDDEN");
  });

  it("el reporte no suma como ingreso un servicio cubierto por la mensualidad", async () => {
    const { m } = await setupMembership();
    await q(DUENO, "select public.register_membership_payment($1, 60000)", [m]);
    const lunes = nextWeekday(1, 2);
    const a = await book(corte, bogota(lunes, "09:00")); // cubierto
    const b = await book(barba, bogota(lunes, "11:00"), "3009998877", "Pedro"); // no cubierto, 12.000
    await db.query("update public.appointments set status = 'completed' where id in ($1, $2)", [a.appointment_id, b.appointment_id]);
    const r = await q<{ report: { services_income: number; membership_income: number; total: number } }>(
      DUENO, "select public.business_report($1, now() - interval '1 day', now() + interval '40 days') as report", [biz]);
    expect(Number(r[0].report.services_income)).toBe(12000);
    expect(Number(r[0].report.membership_income)).toBe(60000);
    expect(r[0].report.total).toBe(2);
  });
});

describe("limpieza de registros viejos", () => {
  it("borra citas que terminaron hace más días de los configurados", async () => {
    const insert = (days: number) =>
      db.query(
        `insert into public.appointments (business_id, service_id, resource_id, customer_name, customer_phone, starts_at, ends_at, status)
         values ($1, $2, $3, 'Viejo', '3000000000', now() - make_interval(days => $4), now() - make_interval(days => $4) + interval '30 min', 'completed')`,
        [biz, corte, esparza, days],
      );
    await insert(100);
    await insert(10);
    await db.query("select public.purge_old_records()");
    expect((await db.query("select * from public.appointments where business_id = $1", [biz])).rows).toHaveLength(2); // sin límite: no borra
    await db.query("update public.businesses set retention_days = 30 where id = $1", [biz]);
    await db.query("select public.purge_old_records()");
    expect((await db.query("select * from public.appointments where business_id = $1", [biz])).rows).toHaveLength(1);
    await expect(q(DUENO, "select public.purge_old_records()")).rejects.toThrow(/permission denied/);
  });

  it("el dueño puede borrar sus citas pasadas a mano, pero no las de otro", async () => {
    const lunes = nextWeekday(1, 2);
    const a = await book(corte, bogota(lunes, "09:00"));
    await q(OTRO, "delete from public.appointments where id = $1", [a.appointment_id]);
    expect((await db.query("select * from public.appointments where business_id = $1", [biz])).rows).toHaveLength(1);
    await q(DUENO, "delete from public.appointments where id = $1", [a.appointment_id]);
    expect((await db.query("select * from public.appointments where business_id = $1", [biz])).rows).toHaveLength(0);
  });
});

describe("avisos y bot", () => {
  it("el servidor obtiene los datos del aviso solo con el secreto", async () => {
    const a = await book(corte, bogota(nextWeekday(1, 2), "09:00"));
    await expect(q(null, "select public.notification_payload('malo', 'appointment', $1)", [a.appointment_id])).rejects.toThrow("FORBIDDEN");
    const p = await q<{ p: { owner_email: string; item: { customer_name: string; service_name: string }; subscriptions: unknown[] } }>(
      null, "select public.notification_payload($1, 'appointment', $2) as p", [SECRET, a.appointment_id]);
    expect(p[0].p.owner_email).toBe("esparza@test.local");
    expect(p[0].p.item).toMatchObject({ customer_name: "Juan Pérez", service_name: "Corte clásico" });
    expect(p[0].p.subscriptions).toEqual([]);
  });

  it("cada dueño guarda sus celulares para notificaciones", async () => {
    await q(DUENO, "select public.save_push_subscription('https://push/1', 'k', 'a', 'Android')");
    expect(await q(DUENO, "select endpoint from public.push_subscriptions")).toHaveLength(1);
    expect(await q(OTRO, "select endpoint from public.push_subscriptions")).toHaveLength(0);
    await expect(q(null, "select public.save_push_subscription('https://push/2', 'k', 'a', 'x')")).rejects.toThrow(/permission denied/);
  });

  it("el bot guarda la conversación y ve las citas del mismo teléfono", async () => {
    await q(null, "select public.bot_save_session($1, $2, '3001112233', '{\"step\":\"menu\"}')", [SECRET, biz]);
    const s = await q<{ s: { step: string } }>(null, "select public.bot_load_session($1, $2, '3001112233') as s", [SECRET, biz]);
    expect(s[0].s).toEqual({ step: "menu" });
    await book(corte, bogota(nextWeekday(1, 2), "09:00"));
    expect(await q(null, "select * from public.bot_customer_bookings($1, $2, '3001112233')", [SECRET, biz])).toHaveLength(1);
    expect(await q(null, "select * from public.bot_customer_bookings($1, $2, '3009999999')", [SECRET, biz])).toHaveLength(0);
    await expect(q(null, "select * from public.bot_customer_bookings('x', $1, '3001112233')", [biz])).rejects.toThrow("FORBIDDEN");
  });
});
