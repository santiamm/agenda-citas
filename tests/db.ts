import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

// Lo mínimo de Supabase que usan las migraciones: esquema auth, auth.uid() y los roles.
const SUPABASE_STUB = `
  create schema if not exists extensions;
  create schema if not exists auth;
  create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
    email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

let template: Promise<Blob | File> | undefined;

/** Base nueva con todas las migraciones. Se migra una sola vez y luego se copia el directorio de datos. */
export async function freshDb() {
  template ??= (async () => {
    const db = await PGlite.create({ extensions: { btree_gist } });
    await db.exec(SUPABASE_STUB);
    for (const file of readdirSync(MIGRATIONS).sort()) {
      await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
    }
    const dump = await db.dumpDataDir("none");
    await db.close();
    return dump;
  })();
  return PGlite.create({ extensions: { btree_gist }, loadDataDir: await template });
}

/** Ejecuta fn como un visitante anónimo o como un usuario logueado, igual que PostgREST. */
export async function as<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    userId
      ? `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`
      : `set role anon; select set_config('request.jwt.claim.sub', '', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function createUser(db: PGlite, id: string, email: string) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

/** Próximo día de la semana (0 = domingo) a partir de mañana + offsetDays, como 'YYYY-MM-DD' en Bogotá. */
export function nextWeekday(weekday: number, offsetDays = 1): string {
  const bogotaToday = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const d = new Date(Date.UTC(bogotaToday.getFullYear(), bogotaToday.getMonth(), bogotaToday.getDate()));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Hora local de Bogotá (UTC-5, sin horario de verano) a ISO UTC. */
export function bogota(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00-05:00`).toISOString();
}
