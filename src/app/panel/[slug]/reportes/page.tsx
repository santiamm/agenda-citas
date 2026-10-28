import type { Metadata } from "next";
import Link from "next/link";
import { addDays, formatMoney, todayIn, zonedToUtc } from "@/lib/format";
import { getOwnerBusiness } from "@/lib/owner";
import { STATUS_LABEL, type AppointmentStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Reportes" };

type Report = {
  total: number;
  by_status: Partial<Record<AppointmentStatus, number>>;
  services_income: number;
  membership_income: number;
  by_resource: { name: string; n: number }[];
  by_service: { name: string; n: number }[];
  top_customers: { name: string; n: number }[];
  by_source: Partial<Record<"web" | "owner" | "bot", number>>;
};

const RANGES = [
  { key: "mes", label: "Este mes" },
  { key: "pasado", label: "Mes pasado" },
  { key: "7", label: "Últimos 7 días" },
  { key: "30", label: "Últimos 30 días" },
];

function range(key: string, tz: string): [string, string] {
  const today = todayIn(tz);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  if (key === "pasado") {
    const d = new Date(`${firstOfMonth}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return [d.toISOString().slice(0, 10), firstOfMonth];
  }
  if (key === "7") return [addDays(today, -6), addDays(today, 1)];
  if (key === "30") return [addDays(today, -29), addDays(today, 1)];
  const next = new Date(`${firstOfMonth}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return [firstOfMonth, next.toISOString().slice(0, 10)];
}

export default async function ReportsPage({ params, searchParams }: PageProps<"/panel/[slug]/reportes">) {
  const { slug } = await params;
  const { r } = await searchParams;
  const { supabase, business } = await getOwnerBusiness(slug);
  const key = typeof r === "string" && RANGES.some((x) => x.key === r) ? r : "mes";
  const [from, to] = range(key, business.timezone);
  const { data } = await supabase.rpc("business_report", {
    p_business_id: business.id,
    p_from: zonedToUtc(from, "00:00", business.timezone).toISOString(),
    p_to: zonedToUtc(to, "00:00", business.timezone).toISOString(),
  });
  const rep = data as Report | null;
  const money = (n: number) => formatMoney(Number(n), business.currency) || "$0";
  const s = rep?.by_status ?? {};
  const attended = (s.completed ?? 0) + (s.confirmed ?? 0);
  const noShowRate = attended + (s.no_show ?? 0) ? Math.round(((s.no_show ?? 0) / (attended + (s.no_show ?? 0))) * 100) : 0;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Reportes</h1>
      <nav className="flex flex-wrap gap-2">
        {RANGES.map((x) => (
          <Link
            key={x.key}
            href={`/panel/${slug}/reportes?r=${x.key}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${x.key === key ? "border-ink bg-ink text-white" : "border-line bg-white"}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {!rep ? (
        <p className="card p-6 text-center text-muted">No se pudo cargar el reporte.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Citas" value={String(rep.total)} />
            <Kpi label="No vino" value={`${noShowRate}%`} hint={`${s.no_show ?? 0} citas`} />
            <Kpi label="Ingresos por servicios" value={money(rep.services_income)} hint="Atendidas, sin mensualidad" />
            <Kpi label="Ingresos por mensualidades" value={money(rep.membership_income)} hint="Pagos registrados" />
          </div>
          <p className="text-xs text-muted">
            Los ingresos son estimados: precio de lista de cada servicio marcado como «Atendida». Lo que pagaron por fuera de la app no aparece.
          </p>

          <Bars title="Por estado" rows={Object.entries(s).map(([k, n]) => ({ name: STATUS_LABEL[k as AppointmentStatus], n: n ?? 0 }))} />
          <Bars title={`Por ${business.resource_label.toLowerCase()}`} rows={rep.by_resource} />
          <Bars title="Servicios más pedidos" rows={rep.by_service} />
          <Bars title="Clientes más frecuentes" rows={rep.top_customers} />
          <Bars
            title="Cómo reservaron"
            rows={[
              { name: "Por la página", n: rep.by_source.web ?? 0 },
              { name: "Por WhatsApp (bot)", n: rep.by_source.bot ?? 0 },
              { name: "Anotadas por ti", n: rep.by_source.owner ?? 0 },
            ].filter((x) => x.n > 0)}
          />
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: { name: string; n: number }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.name} className="text-sm">
            <div className="flex justify-between">
              <span>{r.name}</span>
              <span className="tabular-nums text-muted">{r.n}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-paper">
              <div className="h-2 rounded-full bg-brand" style={{ width: `${(r.n / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
