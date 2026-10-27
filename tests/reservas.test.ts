import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, bogota, createUser, freshDb, nextWeekday } from "./db";

const DUENO = "11111111-1111-4111-8111-111111111111";
const OTRO_DUENO = "22222222-2222-4222-8222-222222222222";

type Slot = { resource_id: string; resource_name: string; starts_at: Date };
type Ctx = { db: PGlite; bizId: string; corte: string; corteBarba: string; barbero1: string };

let ctx: Ctx;

async function setup(): Promise<Ctx> {
  const db = await freshDb();
  await createUser(db, DUENO, "dueno@test.local");
  await createUser(db, OTRO_DUENO, "otro@test.local");
  const bizId = await as(db, DUENO, async () => {
    const r = await db.query<{ id: string }>(
      "select public.create_business('Barbería Prueba', 'barberia-prueba', 'barberia', 'Esparza') as id",
    );
    return r.rows[0].id;
  });
  const services = await db.query<{ id: string; name: string }>(
    "select id, name from public.services where business_id = $1",
    [bizId],
  );
  const byName = (n: string) => services.rows.find((s) => s.name === n)!.id;
  const res = await db.query<{ id: string }>("select id from public.resources where business_id = $1", [bizId]);
  return { db, bizId, corte: byName("Corte clásico"), corteBarba: byName("Corte + barba"), barbero1: res.rows[0].id };
}

async function slots(serviceId: string, date: string, resourceId: string | null = null) {
  const r = await as(ctx.db, null, () =>
    ctx.db.query<Slot>("select * from public.get_available_slots($1, $2, $3, $4)", [
      ctx.bizId,
      serviceId,
      date,
      resourceId,
    ]),
  );
  return r.rows;
}

const times = (rows: Slot[]) =>
  rows.map((s) =>
    new Date(s.starts_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }),
  );

async function book(serviceId: string, startsAt: string, phone = "3001234567", resourceId: string | null = null) {
  return as(ctx.db, null, async () => {
    const r = await ctx.db.query<{ appointment_id: string; cancel_token: string; resource_name: string }>(
      "select * from public.create_booking($1, $2, $3, $4, $5, $6, $7)",
      [ctx.bizId, serviceId, startsAt, "Cliente Prueba", phone, resourceId, null],
    );
    return r.rows[0];
  });
}

beforeEach(async () => {
  ctx = await setup();
});

describe("horarios disponibles", () => {
  it("genera horas cada 15 min dentro del horario, sin pasarse del cierre", async () => {
    const lunes = nextWeekday(1, 2);
    const t = times(await slots(ctx.corte, lunes));
    expect(t[0]).toBe("09:00");
    expect(t.at(-1)).toBe("17:30"); // corte de 30 min, cierre 18:00
    expect(t).toHaveLength(35);
  });

  it("no hay horas el domingo (día sin horario)", async () => {
    expect(await slots(ctx.corte, nextWeekday(0, 2))).toHaveLength(0);
  });

  it("no ofrece días pasados ni más allá del límite de días", async () => {
    expect(await slots(ctx.corte, "2020-01-06")).toHaveLength(0);
    expect(await slots(ctx.corte, nextWeekday(1, 40))).toHaveLength(0);
  });

  it("respeta los bloqueos del negocio", async () => {
    const lunes = nextWeekday(1, 2);
    await ctx.db.query(
      "insert into public.time_off (business_id, starts_at, ends_at, reason) values ($1, $2, $3, 'almuerzo')",
      [ctx.bizId, bogota(lunes, "12:00"), bogota(lunes, "14:00")],
    );
    const t = times(await slots(ctx.corte, lunes));
    expect(t).toContain("11:30");
    expect(t).not.toContain("11:45"); // 11:45-12:15 se cruza con el bloqueo
    expect(t).not.toContain("13:30");
    expect(t).toContain("14:00");
  });
});

describe("reservar sin cuenta", () => {
  it("un visitante reserva con nombre y teléfono y la hora deja de aparecer", async () => {
    const lunes = nextWeekday(1, 2);
    const cita = await book(ctx.corte, bogota(lunes, "10:00"), "300 123-4567");
    expect(cita.appointment_id).toBeTruthy();
    expect(cita.resource_name).toBe("Esparza");

    const guardada = await ctx.db.query<{ customer_phone: string; status: string }>(
      "select customer_phone, status from public.appointments where id = $1",
      [cita.appointment_id],
    );
    expect(guardada.rows[0]).toEqual({ customer_phone: "3001234567", status: "pending" });

    const t = times(await slots(ctx.corte, lunes));
    expect(t).not.toContain("10:00");
    expect(t).not.toContain("09:45"); // 9:45-10:15 se cruzaría
    expect(t).toContain("09:30");
    expect(t).toContain("10:30");
  });

  it("valida nombre y teléfono", async () => {
    const at = bogota(nextWeekday(1, 2), "10:00");
    await expect(
      as(ctx.db, null, () =>
        ctx.db.query("select * from public.create_booking($1, $2, $3, 'A', '3001234567')", [ctx.bizId, ctx.corte, at]),
      ),
    ).rejects.toThrow("INVALID_NAME");
    await expect(book(ctx.corte, at, "123")).rejects.toThrow("INVALID_PHONE");
  });

  it("rechaza horas fuera del horario o que no calzan con los intervalos", async () => {
    const lunes = nextWeekday(1, 2);
    await expect(book(ctx.corte, bogota(lunes, "07:00"))).rejects.toThrow("SLOT_UNAVAILABLE");
    await expect(book(ctx.corte, bogota(lunes, "17:45"))).rejects.toThrow("SLOT_UNAVAILABLE");
    await expect(book(ctx.corte, bogota(lunes, "10:07"))).rejects.toThrow("SLOT_UNAVAILABLE");
  });

  it("limita a 3 citas futuras por teléfono en el mismo negocio", async () => {
    const lunes = nextWeekday(1, 2);
    for (const h of ["09:00", "10:00", "11:00"]) await book(ctx.corte, bogota(lunes, h));
    await expect(book(ctx.corte, bogota(lunes, "12:00"))).rejects.toThrow("TOO_MANY_BOOKINGS");
    await book(ctx.corte, bogota(lunes, "12:00"), "3109998888");
  });

  it("el cliente puede ver y cancelar su cita con el enlace, y la hora se libera", async () => {
    const lunes = nextWeekday(1, 2);
    const cita = await book(ctx.corte, bogota(lunes, "10:00"));
    const info = await as(ctx.db, null, () =>
      ctx.db.query<{ status: string; business_slug: string }>("select * from public.get_booking($1)", [cita.cancel_token]),
    );
    expect(info.rows[0]).toMatchObject({ status: "pending", business_slug: "barberia-prueba" });

    await as(ctx.db, null, () => ctx.db.query("select public.cancel_booking($1)", [cita.cancel_token]));
    expect(times(await slots(ctx.corte, lunes))).toContain("10:00");
    await expect(
      as(ctx.db, null, () => ctx.db.query("select public.cancel_booking($1)", [cita.cancel_token])),
    ).rejects.toThrow("NOT_CANCELLABLE");
  });
});

describe("no se cruzan dos citas", () => {
  it("la misma hora no se puede reservar dos veces", async () => {
    const at = bogota(nextWeekday(1, 2), "10:00");
    await book(ctx.corte, at);
    await expect(book(ctx.corte, at, "3109998888")).rejects.toThrow(/SLOT_(UNAVAILABLE|TAKEN)/);
  });

  it("un servicio largo bloquea las horas que se le cruzan", async () => {
    const lunes = nextWeekday(1, 2);
    await book(ctx.corteBarba, bogota(lunes, "10:00")); // 10:00 - 10:45
    await expect(book(ctx.corte, bogota(lunes, "10:30"), "3109998888")).rejects.toThrow("SLOT_UNAVAILABLE");
    await expect(book(ctx.corte, bogota(lunes, "09:45"), "3109998888")).rejects.toThrow("SLOT_UNAVAILABLE");
    await book(ctx.corte, bogota(lunes, "10:45"), "3109998888"); // justo al terminar: sí
  });

  it("la base de datos lo impide aunque alguien se salte la función de reservar", async () => {
    const lunes = nextWeekday(1, 2);
    const insert = (desde: string, hasta: string, status = "pending") =>
      ctx.db.query(
        `insert into public.appointments
          (business_id, service_id, resource_id, customer_name, customer_phone, starts_at, ends_at, status)
         values ($1, $2, $3, 'Directo', '3000000000', $4, $5, $6)`,
        [ctx.bizId, ctx.corte, ctx.barbero1, bogota(lunes, desde), bogota(lunes, hasta), status],
      );
    await insert("10:00", "10:30");
    await expect(insert("10:15", "10:45")).rejects.toThrow(/appointments_no_overlap/);
    await insert("10:15", "10:45", "cancelled"); // una cancelada no ocupa
    await insert("10:30", "11:00"); // contigua: sí
  });

  it("con varios recursos, 'cualquiera' asigna al siguiente libre", async () => {
    const lunes = nextWeekday(1, 2);
    const r2 = await ctx.db.query<{ id: string }>(
      "insert into public.resources (business_id, name) values ($1, 'Barbero 2') returning id",
      [ctx.bizId],
    );
    await ctx.db.query(
      "insert into public.working_hours (business_id, resource_id, weekday, start_time, end_time) values ($1, $2, 1, '09:00', '18:00')",
      [ctx.bizId, r2.rows[0].id],
    );
    const at = bogota(lunes, "10:00");
    const a = await book(ctx.corte, at, "3000000001");
    const b = await book(ctx.corte, at, "3000000002");
    expect(new Set([a.resource_name, b.resource_name])).toEqual(new Set(["Esparza", "Barbero 2"]));
    await expect(book(ctx.corte, at, "3000000003")).rejects.toThrow("SLOT_UNAVAILABLE");
  });
});

describe("permisos", () => {
  it("un visitante no puede leer las citas (ni los teléfonos)", async () => {
    await book(ctx.corte, bogota(nextWeekday(1, 2), "10:00"));
    await expect(as(ctx.db, null, () => ctx.db.query("select * from public.appointments"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("solo el dueño ve y cambia el estado de sus citas", async () => {
    const lunes = nextWeekday(1, 2);
    const cita = await book(ctx.corte, bogota(lunes, "10:00"));

    const ajenas = await as(ctx.db, OTRO_DUENO, () => ctx.db.query("select id from public.appointments"));
    expect(ajenas.rows).toHaveLength(0);
    await as(ctx.db, OTRO_DUENO, () =>
      ctx.db.query("update public.appointments set status = 'cancelled' where id = $1", [cita.appointment_id]),
    );

    const propias = await as(ctx.db, DUENO, () =>
      ctx.db.query<{ status: string }>("select status from public.appointments where id = $1", [cita.appointment_id]),
    );
    expect(propias.rows[0].status).toBe("pending"); // el otro dueño no pudo cancelarla

    await as(ctx.db, DUENO, () =>
      ctx.db.query("update public.appointments set status = 'confirmed' where id = $1", [cita.appointment_id]),
    );
    const r = await ctx.db.query<{ status: string }>("select status from public.appointments where id = $1", [
      cita.appointment_id,
    ]);
    expect(r.rows[0].status).toBe("confirmed");
  });

  it("reactivar una cita cancelada cuya hora ya se ocupó también se bloquea", async () => {
    const at = bogota(nextWeekday(1, 2), "10:00");
    const primera = await book(ctx.corte, at);
    await as(ctx.db, DUENO, () =>
      ctx.db.query("update public.appointments set status = 'cancelled' where id = $1", [primera.appointment_id]),
    );
    await book(ctx.corte, at, "3109998888");
    await expect(
      as(ctx.db, DUENO, () =>
        ctx.db.query("update public.appointments set status = 'confirmed' where id = $1", [primera.appointment_id]),
      ),
    ).rejects.toThrow(/appointments_no_overlap/);
  });

  it("no se puede crear un negocio con un enlace ya usado", async () => {
    await expect(
      as(ctx.db, OTRO_DUENO, () =>
        ctx.db.query("select public.create_business('Otra', 'barberia-prueba', 'barberia')"),
      ),
    ).rejects.toThrow("SLUG_TAKEN");
  });

  it("el panel de ejemplo solo muestra negocios demo y oculta teléfonos", async () => {
    const lunes = nextWeekday(1, 2);
    await book(ctx.corte, bogota(lunes, "10:00"));
    const rango = [bogota(lunes, "00:00"), bogota(lunes, "23:59")];
    const q = () =>
      as(ctx.db, null, () =>
        ctx.db.query<{ customer_phone: string }>("select * from public.get_demo_appointments('barberia-prueba', $1, $2)", rango),
      );
    expect((await q()).rows).toHaveLength(0);
    await ctx.db.query("update public.businesses set is_demo = true where id = $1", [ctx.bizId]);
    const rows = (await q()).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].customer_phone).not.toContain("1234567");
  });
});

describe("negocio demo", () => {
  it("se crea con agenda sin choques y se puede regenerar", async () => {
    const count = async () =>
      (await ctx.db.query<{ n: number }>(
        "select count(*)::int as n from public.appointments a join public.businesses b on b.id = a.business_id where b.slug = 'barberia-demo'",
      )).rows[0].n;
    const antes = await count();
    expect(antes).toBeGreaterThan(10);
    await ctx.db.query("select public.reset_demo_appointments()");
    expect(await count()).toBe(antes);
    await expect(
      as(ctx.db, null, () => ctx.db.query("select public.reset_demo_appointments()")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("enlaces reservados", () => {
  it("no deja usar enlaces que chocan con rutas de la app", async () => {
    await expect(
      as(ctx.db, OTRO_DUENO, () => ctx.db.query("select public.create_business('Mi cuenta', 'cuenta', 'otro')")),
    ).rejects.toThrow(/businesses_slug_not_reserved/);
  });
});
