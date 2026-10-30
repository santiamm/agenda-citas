import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { formatDateLong, formatMoney, formatTime, todayIn, whatsappLink } from "@/lib/format";
import { APPOINTMENT_SELECT, getOwnerBusiness, toAgendaItems, type AppointmentRow } from "@/lib/owner";
import { STATUS_LABEL, type MembershipRow } from "@/lib/types";
import { saveCustomerAction } from "../../../more-actions";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: PageProps<"/panel/[slug]/clientes/[id]">) {
  const { slug, id } = await params;
  const { supabase, business } = await getOwnerBusiness(slug);
  const { data: c } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle<{ id: string; name: string; phone: string; notes: string | null; created_at: string }>();
  if (!c) notFound();

  const [appts, members] = await Promise.all([
    supabase.from("appointments").select(APPOINTMENT_SELECT).eq("customer_id", id).order("starts_at", { ascending: false }).returns<AppointmentRow[]>(),
    supabase.rpc("membership_overview", { p_business_id: business.id }),
  ]);
  const history = toAgendaItems(appts.data ?? []);
  const tz = business.timezone;
  const now = new Date().toISOString();
  const visits = history.filter((a) => a.status === "completed" || (a.status === "confirmed" && a.starts_at < now)).length;
  const noShows = history.filter((a) => a.status === "no_show").length;
  const cancelled = history.filter((a) => a.status === "cancelled").length;
  const upcoming = history.filter((a) => a.starts_at >= now && (a.status === "pending" || a.status === "confirmed"));
  const favorite = Object.entries(
    history.reduce<Record<string, number>>((acc, a) => ((acc[a.service_name] = (acc[a.service_name] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1])[0]?.[0];
  const memberships = ((members.data ?? []) as MembershipRow[]).filter((m) => m.customer_id === id);

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/panel/${slug}/clientes`} className="text-sm text-muted underline underline-offset-4">
          ← Clientes
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{c.name}</h1>
        <div className="mt-1 flex flex-wrap gap-2">
          <a href={whatsappLink(c.phone)} target="_blank" rel="noreferrer" className="btn-ghost min-h-9 px-3 text-sm">
            WhatsApp {c.phone}
          </a>
          <Link href={`/panel/${slug}/nueva`} className="btn-ghost min-h-9 px-3 text-sm">
            + Anotarle una cita
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat n={visits} label="visitas" />
        <Stat n={noShows} label="no vino" warn={noShows > 0} />
        <Stat n={cancelled} label="canceló" />
      </div>
      {favorite && <p className="text-sm text-muted">Lo que más pide: <strong className="text-ink">{favorite}</strong></p>}

      {memberships.map((m) => (
        <div key={m.membership_id} className={`card p-4 ${m.is_paid ? "border-violet-200 bg-violet-50" : "border-red-200 bg-red-50"}`}>
          <p className="font-semibold">
            {m.plan_name} · {formatMoney(m.price, business.currency) || "sin precio"}/mes
          </p>
          <p className="text-sm">
            {m.status === "cancelled" ? "Cancelada" : m.is_paid ? `Al día hasta el ${m.paid_until}` : m.paid_until ? `Vencida desde el ${m.paid_until}` : "Sin pagos registrados"}
            {" · "}
            {m.visits_used}/{m.visits_limit ?? "∞"} visitas este periodo
          </p>
          <Link href={`/panel/${slug}/mensualidades`} className="text-sm text-brand underline underline-offset-4">
            Registrar pago
          </Link>
        </div>
      ))}

      {upcoming.length > 0 && (
        <section>
          <h2 className="font-semibold">Próximas citas</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link href={`/panel/${slug}?d=${todayIn(tz, new Date(a.starts_at))}`} className="underline underline-offset-4">
                  {formatDateLong(a.starts_at, tz)}, {formatTime(a.starts_at, tz)}
                </Link>{" "}
                · {a.service_name} · {STATUS_LABEL[a.status]}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-semibold">Historial</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Sin citas registradas.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white">
            {history.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  {formatDateLong(a.starts_at, tz)} · {a.service_name} · {a.resource_name}
                </span>
                <span className="shrink-0 text-muted">{STATUS_LABEL[a.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Editar datos y notas</summary>
        <div className="mt-3">
          <ActionForm action={saveCustomerAction} submit="Guardar" hidden={{ slug, id: c.id }}>
            <input name="name" className="input" defaultValue={c.name} required aria-label="Nombre" />
            <input name="phone" className="input" defaultValue={c.phone} type="tel" required aria-label="Celular" />
            <textarea
              name="notes"
              className="input min-h-24 py-2"
              defaultValue={c.notes ?? ""}
              placeholder="Ej.: le gusta degradado bajo, alérgico a…"
              maxLength={1000}
              aria-label="Notas"
            />
          </ActionForm>
        </div>
      </details>
    </div>
  );
}

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className={`card py-3 ${warn ? "border-red-200 bg-red-50" : ""}`}>
      <p className="text-2xl font-semibold">{n}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
