import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addDays, todayIn } from "@/lib/format";
import { as, bogota, createUser, freshDb } from "./db";

const DUENO = "11111111-1111-4111-8111-111111111111";
const SECRET = "secreto-de-prueba";
let db: PGlite;
let biz: string;
let corte: string;

const q = async <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  (await as(db, user, () => db.query<T>(sql, params))).rows;

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, DUENO, "esparza@test.local");
  await db.query("insert into private.app_config values ('app_secret_sha256', encode(sha256(convert_to($1, 'UTF8')), 'hex'))", [SECRET]);
  biz = (await q<{ id: string }>(DUENO, "select public.create_business('Barbería', 'barberia-r', 'barberia', 'Esparza') as id"))[0].id;
  corte = (await db.query<{ id: string }>("select id from public.services where business_id = $1 and name = 'Corte clásico'", [biz])).rows[0].id;
  // Abierto todos los días para que "mañana" siempre tenga horario.
  const res = (await db.query<{ id: string }>("select id from public.resources where business_id = $1", [biz])).rows[0].id;
  await db.query("insert into public.working_hours (business_id, resource_id, weekday, start_time, end_time) values ($1, $2, 0, '09:00', '18:00')", [biz, res]);
});

async function bookTomorrow(hhmm: string, phone: string) {
  const tomorrow = addDays(todayIn("America/Bogota"), 1);
  return (
    await q<{ appointment_id: string; cancel_token: string }>(null, "select * from public.create_booking($1, $2, $3, 'Juan', $4)", [
      biz,
      corte,
      bogota(tomorrow, hhmm),
      phone,
    ])
  )[0];
}

describe("recordatorios automáticos", () => {
  it("el cliente pide aviso con el enlace de su cita y la tarea diaria lo encuentra una sola vez", async () => {
    const a = await bookTomorrow("10:00", "3001112233");
    await bookTomorrow("11:00", "3009998877"); // sin aviso: no aparece

    await q(null, "select public.save_booking_push($1, 'https://push/c1', 'k', 'a')", [a.cancel_token]);
    await expect(
      q(null, "select public.save_booking_push(gen_random_uuid(), 'https://push/x', 'k', 'a')"),
    ).rejects.toThrow("NOT_FOUND");

    const due = await q<{ appointment_id: string; subscriptions: unknown[] }>(null, "select * from public.reminders_due($1)", [SECRET]);
    expect(due).toHaveLength(1);
    expect(due[0].appointment_id).toBe(a.appointment_id);
    expect(due[0].subscriptions).toHaveLength(1);

    await q(null, "select public.mark_reminded($1, $2)", [SECRET, [a.appointment_id]]);
    expect(await q(null, "select * from public.reminders_due($1)", [SECRET])).toHaveLength(0);
  });

  it("el resumen del dueño cuenta las citas de mañana", async () => {
    await bookTomorrow("10:00", "3001112233");
    await bookTomorrow("11:00", "3009998877");
    expect(await q(null, "select * from public.owner_daily_summary($1)", [SECRET])).toHaveLength(0); // sin celular activo
    await q(DUENO, "select public.save_push_subscription('https://push/owner', 'k', 'a', 'Android')");
    const s = await q<{ total: number; pending: number }>(null, "select * from public.owner_daily_summary($1)", [SECRET]);
    expect(s[0]).toMatchObject({ total: 2, pending: 2 });
  });

  it("todo exige el secreto del servidor y nadie lee la tabla directo", async () => {
    await expect(q(null, "select * from public.reminders_due('malo')")).rejects.toThrow("FORBIDDEN");
    await expect(q(null, "select * from public.owner_daily_summary('malo')")).rejects.toThrow("FORBIDDEN");
    await expect(q(DUENO, "select * from public.appointment_push")).rejects.toThrow(/permission denied/);
  });
});
