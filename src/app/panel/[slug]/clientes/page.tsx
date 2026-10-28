import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getOwnerBusiness } from "@/lib/owner";
import type { MembershipRow } from "@/lib/types";
import { saveCustomerAction } from "../../more-actions";

export const metadata: Metadata = { title: "Clientes" };

type Customer = { id: string; name: string; phone: string; created_at: string };
type Stat = { customer_id: string; starts_at: string; status: string };

export default async function CustomersPage({ params, searchParams }: PageProps<"/panel/[slug]/clientes">) {
  const { slug } = await params;
  const { q } = await searchParams;
  const { supabase, business } = await getOwnerBusiness(slug);
  const term = typeof q === "string" ? q.trim() : "";

  let query = supabase.from("customers").select("id, name, phone, created_at").eq("business_id", business.id).order("name").limit(200);
  if (term) query = query.or(`name.ilike.%${term.replace(/[%,()]/g, "")}%,phone.ilike.%${term.replace(/\D/g, "") || "~"}%`);
  const [cust, appts, members] = await Promise.all([
    query.returns<Customer[]>(),
    supabase.from("appointments").select("customer_id, starts_at, status").eq("business_id", business.id).not("customer_id", "is", null).returns<Stat[]>(),
    supabase.rpc("membership_overview", { p_business_id: business.id }),
  ]);
  const stats = new Map<string, { visits: number; noShows: number; last: string | null }>();
  const now = new Date().toISOString();
  for (const a of appts.data ?? []) {
    const s = stats.get(a.customer_id) ?? { visits: 0, noShows: 0, last: null };
    if (a.status === "completed" || (a.status === "confirmed" && a.starts_at < now)) {
      s.visits++;
      if (!s.last || a.starts_at > s.last) s.last = a.starts_at;
    }
    if (a.status === "no_show") s.noShows++;
    stats.set(a.customer_id, s);
  }
  const memberSet = new Map(((members.data ?? []) as MembershipRow[]).filter((m) => m.status !== "cancelled").map((m) => [m.customer_id, m]));
  const customers = cust.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Clientes</h1>
        <p className="text-sm text-muted">Se guardan solos cuando alguien reserva. Toca uno para ver su historial.</p>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={term} placeholder="Buscar por nombre o celular" className="input" aria-label="Buscar" />
        <button className="btn-ghost shrink-0">Buscar</button>
      </form>

      <ul className="space-y-2">
        {customers.length === 0 && <li className="card p-6 text-center text-muted">{term ? "Nadie coincide." : "Todavía no hay clientes."}</li>}
        {customers.map((c) => {
          const s = stats.get(c.id);
          const m = memberSet.get(c.id);
          return (
            <li key={c.id}>
              <Link href={`/panel/${slug}/clientes/${c.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-muted">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="text-sm text-muted">
                    {c.phone} · {s?.visits ?? 0} {s?.visits === 1 ? "visita" : "visitas"}
                    {s?.noShows ? ` · ${s.noShows} no vino` : ""}
                  </span>
                </span>
                {m && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${m.is_paid ? "bg-violet-100 text-violet-800" : "bg-red-50 text-red-700"}`}>
                    {m.is_paid ? "Mensualidad" : "Mensualidad vencida"}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">+ Agregar cliente a mano</summary>
        <div className="mt-3">
          <ActionForm action={saveCustomerAction} submit="Agregar" hidden={{ slug, business_id: business.id }}>
            <input name="name" className="input" placeholder="Nombre" required aria-label="Nombre" />
            <input name="phone" className="input" placeholder="Celular" type="tel" inputMode="tel" required aria-label="Celular" />
            <input name="notes" className="input" placeholder="Nota (opcional)" aria-label="Nota" />
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
