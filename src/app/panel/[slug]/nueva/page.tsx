import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { formatDuration, todayIn } from "@/lib/format";
import { getOwnerBusiness } from "@/lib/owner";
import type { Resource, Service } from "@/lib/types";
import { ownerBookingAction } from "../../more-actions";

export const metadata: Metadata = { title: "Nueva cita" };

export default async function NewAppointmentPage({ params, searchParams }: PageProps<"/panel/[slug]/nueva">) {
  const { slug } = await params;
  const { d } = await searchParams;
  const { supabase, business } = await getOwnerBusiness(slug);
  const [svc, res] = await Promise.all([
    supabase.from("services").select("*").eq("business_id", business.id).eq("is_active", true).order("sort"),
    supabase.from("resources").select("*").eq("business_id", business.id).eq("is_active", true).order("sort"),
  ]);
  const services = (svc.data ?? []) as Service[];
  const resources = (res.data ?? []) as Resource[];
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIn(business.timezone);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/panel/${slug}?d=${date}`} className="text-sm text-muted underline underline-offset-4">
          ← Agenda
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Anotar una cita</h1>
        <p className="text-sm text-muted">
          Para quien llamó o llegó al local. Queda confirmada. Puedes salirte del horario, pero no cruzarla con otra cita.
        </p>
      </div>
      <div className="card p-4">
        <ActionForm
          action={ownerBookingAction}
          submit="Guardar cita"
          hidden={{ slug, business_id: business.id, timezone: business.timezone }}
        >
          <div>
            <label className="label" htmlFor="name">
              Nombre del cliente
            </label>
            <input id="name" name="name" className="input" required minLength={2} maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Celular <span className="font-normal text-muted">(opcional, para el historial)</span>
            </label>
            <input id="phone" name="phone" type="tel" inputMode="tel" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="service_id">
              Servicio
            </label>
            <select id="service_id" name="service_id" className="input" required>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatDuration(s.duration_minutes)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="resource_id">
              {business.resource_label}
            </label>
            <select id="resource_id" name="resource_id" className="input" required>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="date">
                Día
              </label>
              <input id="date" name="date" type="date" className="input" defaultValue={date} required />
            </div>
            <div>
              <label className="label" htmlFor="time">
                Hora
              </label>
              <input id="time" name="time" type="time" step={300} className="input" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="notes">
              Nota <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input id="notes" name="notes" className="input" maxLength={500} />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
