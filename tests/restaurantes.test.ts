import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, bogota, createUser, freshDb, nextWeekday } from "./db";

const DUENO = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
let biz: string;
let svc: Record<string, string>;

const q = async <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  (await as(db, user, () => db.query<T>(sql, params))).rows;

beforeEach(async () => {
  db = await freshDb();
  await createUser(db, DUENO, "fogon@test.local");
  biz = (await q<{ id: string }>(DUENO, "select public.create_business('El Fogón', 'el-fogon', 'restaurante') as id"))[0].id;
  const rows = await db.query<{ id: string; name: string }>("select id, name from public.services where business_id = $1", [biz]);
  svc = Object.fromEntries(rows.rows.map((r) => [r.name, r.id]));
});

const book = (service: string, at: string, phone: string) =>
  q<{ resource_name: string }>(null, "select * from public.create_booking($1, $2, $3, 'Cliente', $4)", [biz, service, at, phone]).then((r) => r[0]);

describe("restaurantes: capacidad de mesas", () => {
  it("la plantilla crea 4 mesas con capacidad y servicios con mínimo de personas", async () => {
    const mesas = await db.query<{ name: string; capacity: number }>(
      "select name, capacity from public.resources where business_id = $1 order by sort, name", [biz]);
    expect(mesas.rows.map((m) => m.capacity)).toEqual([2, 2, 4, 6]);
    const hours = await db.query<{ n: number }>("select count(distinct resource_id)::int n from public.working_hours where business_id = $1", [biz]);
    expect(hours.rows[0].n).toBe(4);
  });

  it("un grupo de 6 solo ve horas de la mesa donde cabe", async () => {
    const martes = nextWeekday(2, 2);
    const slots = await q<{ resource_name: string }>(null, "select * from public.get_available_slots($1, $2, $3)", [biz, svc["Mesa para 6 o más"], martes]);
    expect(new Set(slots.map((s) => s.resource_name))).toEqual(new Set(["Mesa 4"]));
  });

  it("con 'cualquiera' asigna la mesa más pequeña que alcanza", async () => {
    const at = bogota(nextWeekday(2, 2), "13:00");
    const a = await book(svc["Mesa para 2"], at, "3000000001");
    const b = await book(svc["Mesa para 2"], at, "3000000002");
    const c = await book(svc["Mesa para 2"], at, "3000000003"); // las de 2 se llenaron: usa la de 4
    expect([a.resource_name, b.resource_name].sort()).toEqual(["Mesa 1", "Mesa 2"]);
    expect(c.resource_name).toBe("Mesa 3");
    const d = await book(svc["Mesa para 2"], at, "3000000004");
    expect(d.resource_name).toBe("Mesa 4");
    await expect(book(svc["Mesa para 2"], at, "3000000005")).rejects.toThrow("SLOT_UNAVAILABLE");
  });

  it("existe el restaurante de ejemplo con 5 mesas", async () => {
    const r = await db.query<{ n: number }>(
      "select count(*)::int n from public.resources r join public.businesses b on b.id = r.business_id where b.slug = 'restaurante-demo'");
    expect(r.rows[0].n).toBe(5);
  });
});
