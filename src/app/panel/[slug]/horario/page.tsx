import type { Metadata } from "next";
import { formatDateLong, formatTime } from "@/lib/format";
import { getOwnerBusiness } from "@/lib/owner";
import type { Resource, TimeOff, WorkingHour } from "@/lib/types";
import { deleteResourceAction, deleteTimeOffAction } from "../../actions";
import { HoursForm, ResourceForm, TimeOffForm } from "./forms";

export const metadata: Metadata = { title: "Horario" };

export default async function SchedulePage({ params }: PageProps<"/panel/[slug]/horario">) {
  const { slug } = await params;
  const { supabase, business } = await getOwnerBusiness(slug);
  const [res, hrs, off] = await Promise.all([
    supabase.from("resources").select("*").eq("business_id", business.id).order("sort").order("name"),
    supabase.from("working_hours").select("*").eq("business_id", business.id).order("start_time"),
    supabase
      .from("time_off")
      .select("*")
      .eq("business_id", business.id)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
  ]);
  const resources = (res.data ?? []) as Resource[];
  const hours = (hrs.data ?? []) as WorkingHour[];
  const timeOff = (off.data ?? []) as TimeOff[];
  const label = business.resource_label;
  const tz = business.timezone;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold">Horario de atención</h1>
          <p className="text-sm text-muted">
            Cada {label.toLowerCase()} tiene su propio horario. Dos tramos por día sirven para dejar libre el almuerzo.
          </p>
        </div>
        {resources.map((r) => (
          <div key={r.id} className={`card p-4 ${r.is_active ? "" : "opacity-60"}`}>
            <ResourceForm slug={slug} businessId={business.id} resource={r} />
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand">Horario semanal de {r.name}</summary>
              <div className="mt-3">
                <HoursForm slug={slug} businessId={business.id} resourceId={r.id} hours={hours.filter((h) => h.resource_id === r.id)} />
              </div>
            </details>
            {resources.length > 1 && (
              <form action={deleteResourceAction} className="mt-3">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="slug" value={slug} />
                <button className="text-sm text-red-700 underline underline-offset-4">
                  Quitar {r.name} (si tiene citas, solo se desactiva)
                </button>
              </form>
            )}
          </div>
        ))}
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Agregar {label.toLowerCase()}</h2>
          <ResourceForm slug={slug} businessId={business.id} copyFrom={resources[0]?.id} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Días bloqueados</h2>
          <p className="text-sm text-muted">Vacaciones, festivos o una salida: nadie podrá reservar en ese rango.</p>
        </div>
        {timeOff.length > 0 && (
          <ul className="space-y-2">
            {timeOff.map((t) => (
              <li key={t.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  <span className="block font-medium">
                    {t.reason || "Bloqueo"} · {t.resource_id ? resources.find((r) => r.id === t.resource_id)?.name : "Todo el negocio"}
                  </span>
                  <span className="text-muted">
                    {formatDateLong(t.starts_at, tz)} {formatTime(t.starts_at, tz)} → {formatDateLong(t.ends_at, tz)}{" "}
                    {formatTime(t.ends_at, tz)}
                  </span>
                </span>
                <form action={deleteTimeOffAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <button className="btn-danger min-h-9 px-3 text-sm">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="card p-4">
          <TimeOffForm slug={slug} businessId={business.id} timezone={tz} resources={resources} />
        </div>
      </section>
    </div>
  );
}
