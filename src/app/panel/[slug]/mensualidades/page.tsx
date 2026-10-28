import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { formatMoney, todayIn, whatsappLink } from "@/lib/format";
import { getOwnerBusiness } from "@/lib/owner";
import type { MembershipRow, Service } from "@/lib/types";
import { createMembershipAction, registerPaymentAction } from "../../more-actions";
import { Box, MethodSelect, PlanFields, StatusBtn, type Plan } from "./parts";

export const metadata: Metadata = { title: "Mensualidades" };

type Payment = { id: string; membership_id: string; amount: number; paid_on: string; period_start: string; period_end: string; method: string };

export default async function MembershipsPage({ params }: PageProps<"/panel/[slug]/mensualidades">) {
  const { slug } = await params;
  const { supabase, business } = await getOwnerBusiness(slug);
  const [plansRes, psRes, svcRes, overview, payRes] = await Promise.all([
    supabase.from("plans").select("*").eq("business_id", business.id).order("created_at").returns<Plan[]>(),
    supabase.from("plan_services").select("plan_id, service_id").eq("business_id", business.id),
    supabase.from("services").select("*").eq("business_id", business.id).order("sort"),
    supabase.rpc("membership_overview", { p_business_id: business.id }),
    supabase.from("membership_payments").select("*").eq("business_id", business.id).order("paid_on", { ascending: false }).limit(50).returns<Payment[]>(),
  ]);
  const plans = plansRes.data ?? [];
  const activePlans = plans.filter((p) => p.is_active);
  const planServices = psRes.data ?? [];
  const services = (svcRes.data ?? []) as Service[];
  const rows = ((overview.data ?? []) as MembershipRow[]).filter((m) => m.status !== "cancelled");
  const payments = payRes.data ?? [];
  const money = (n: number) => formatMoney(Number(n), business.currency) || "$0";
  const today = todayIn(business.timezone);
  const overdue = rows.filter((r) => r.status === "active" && !r.is_paid).length;
  const monthIncome = payments.filter((p) => p.paid_on.slice(0, 7) === today.slice(0, 7)).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Mensualidades</h1>
        <p className="text-sm text-muted">
          Clientes que pagan un plan fijo al mes. Registras el pago a mano y la app dice quién está al día y cuántas visitas lleva.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Box n={String(rows.filter((r) => r.is_paid).length)} label="al día" />
        <Box n={String(overdue)} label="vencidas" warn={overdue > 0} />
        <Box n={money(monthIncome)} label="cobrado este mes" small />
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Clientes con mensualidad</h2>
        {rows.length === 0 && <p className="card p-4 text-sm text-muted">Nadie inscrito todavía. Crea un plan y luego inscribe al cliente.</p>}
        {rows.map((m) => {
          const first = m.customer_name.split(" ")[0];
          return (
            <details key={m.membership_id} className={`card ${m.is_paid ? "" : "border-red-200"}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {m.customer_name} {m.status === "paused" && <span className="text-xs text-muted">(pausada)</span>}
                  </span>
                  <span className="text-sm text-muted">
                    {m.plan_name} · {m.visits_used}/{m.visits_limit ?? "∞"} visitas
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${m.is_paid ? "bg-brand-soft text-brand" : "bg-red-50 text-red-700"}`}>
                  {m.is_paid ? `Al día · ${m.paid_until}` : m.paid_until ? `Vencida · ${m.paid_until}` : "Sin pago"}
                </span>
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                {m.visits_limit !== null && m.visits_used >= m.visits_limit && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Ya usó todas las visitas de este periodo.</p>
                )}
                <ActionForm action={registerPaymentAction} submit="Registrar pago" hidden={{ slug, membership_id: m.membership_id }}>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="amount" type="number" min={0} step={500} defaultValue={m.price} className="input" aria-label="Valor" />
                    <MethodSelect />
                  </div>
                  <input name="paid_on" type="date" defaultValue={today} className="input" aria-label="Fecha del pago" />
                </ActionForm>
                <div className="flex flex-wrap gap-2">
                  <a
                    className="btn-ghost min-h-9 px-3 text-sm"
                    target="_blank"
                    rel="noreferrer"
                    href={whatsappLink(
                      m.customer_phone,
                      m.is_paid
                        ? `Hola ${first}, tu mensualidad (${m.plan_name}) está al día hasta el ${m.paid_until}. Llevas ${m.visits_used} de ${m.visits_limit ?? "ilimitadas"} visitas. ¡Gracias!`
                        : `Hola ${first}, te recordamos que tu mensualidad (${m.plan_name}, ${money(m.price)}) está pendiente de pago. ¡Gracias!`,
                    )}
                  >
                    {m.is_paid ? "Enviar estado" : "Cobrar por WhatsApp"}
                  </a>
                  <Link href={`/panel/${slug}/clientes/${m.customer_id}`} className="btn-ghost min-h-9 px-3 text-sm">
                    Historial
                  </Link>
                  <StatusBtn id={m.membership_id} slug={slug} to={m.status === "paused" ? "active" : "paused"} label={m.status === "paused" ? "Reanudar" : "Pausar"} />
                  <StatusBtn id={m.membership_id} slug={slug} to="cancelled" label="Dar de baja" danger />
                </div>
                <ul className="text-xs text-muted">
                  {payments
                    .filter((p) => p.membership_id === m.membership_id)
                    .slice(0, 4)
                    .map((p) => (
                      <li key={p.id}>
                        Pagó {money(p.amount)} ({p.method}) el {p.paid_on} · cubre {p.period_start} → {p.period_end}
                      </li>
                    ))}
                </ul>
              </div>
            </details>
          );
        })}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Inscribir a un cliente</h2>
        {activePlans.length === 0 ? (
          <p className="text-sm text-muted">Primero crea un plan abajo.</p>
        ) : (
          <ActionForm action={createMembershipAction} submit="Inscribir" hidden={{ slug, business_id: business.id }} resetOnOk>
            <select name="plan_id" className="input" aria-label="Plan">
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.price)}
                </option>
              ))}
            </select>
            <input name="phone" className="input" placeholder="Celular del cliente" type="tel" inputMode="tel" required aria-label="Celular" />
            <input name="name" className="input" placeholder="Nombre (si es cliente nuevo)" aria-label="Nombre" />
            <label className="label" htmlFor="starts_on">
              Empieza el
            </label>
            <input id="starts_on" name="starts_on" type="date" defaultValue={today} className="input" />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="paid_now" defaultChecked className="h-5 w-5 accent-brand" />
              Ya pagó el primer mes
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input name="amount" type="number" min={0} step={500} className="input" placeholder="Valor pagado" aria-label="Valor pagado" />
              <MethodSelect />
            </div>
          </ActionForm>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Planes</h2>
        {plans.map((p) => (
          <details key={p.id} className={`card ${p.is_active ? "" : "opacity-60"}`}>
            <summary className="flex cursor-pointer list-none items-center justify-between p-4">
              <span>
                <span className="block font-medium">{p.name}</span>
                <span className="text-sm text-muted">
                  {money(p.price)}/mes · {p.visits_per_period ? `${p.visits_per_period} visitas` : "visitas ilimitadas"}
                </span>
              </span>
              <span className="text-sm text-brand">Editar</span>
            </summary>
            <div className="border-t border-line p-4">
              <PlanFields
                plan={p}
                services={services}
                included={planServices.filter((x) => x.plan_id === p.id).map((x) => x.service_id)}
                slug={slug}
                businessId={business.id}
              />
            </div>
          </details>
        ))}
        <div className="card p-4">
          <h3 className="mb-3 font-semibold">Nuevo plan</h3>
          <PlanFields services={services} included={[]} slug={slug} businessId={business.id} />
        </div>
      </section>
    </div>
  );
}
