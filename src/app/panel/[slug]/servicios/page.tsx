import type { Metadata } from "next";
import { formatDuration, formatMoney } from "@/lib/format";
import { getOwnerBusiness } from "@/lib/owner";
import type { Resource, Service } from "@/lib/types";
import { ActionForm } from "@/components/action-form";
import { deleteServiceAction } from "../../actions";
import { saveServiceResourcesAction } from "../../more-actions";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServicesPage({ params }: PageProps<"/panel/[slug]/servicios">) {
  const { slug } = await params;
  const { supabase, business } = await getOwnerBusiness(slug);
  const [{ data }, res, rs] = await Promise.all([
    supabase.from("services").select("*").eq("business_id", business.id).order("sort").order("name"),
    supabase.from("resources").select("*").eq("business_id", business.id).eq("is_active", true).order("sort"),
    supabase.from("resource_services").select("resource_id, service_id").eq("business_id", business.id),
  ]);
  const services = (data ?? []) as Service[];
  const resources = (res.data ?? []) as Resource[];
  const assigned = rs.data ?? [];
  const doers = (serviceId: string) => {
    const ids = assigned.filter((a) => a.service_id === serviceId).map((a) => a.resource_id);
    return ids.length ? resources.filter((r) => ids.includes(r.id)) : resources;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Servicios</h1>
        <p className="text-sm text-muted">
          Lo que tus clientes pueden reservar. La duración define cuánto tiempo bloquea en la agenda.
        </p>
      </div>

      <ul className="space-y-2">
        {services.map((s) => (
          <li key={s.id} className={`card ${s.is_active ? "" : "opacity-60"}`}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                <span>
                  <span className="block font-medium">
                    {s.name} {!s.is_active && <span className="text-xs text-muted">(oculto)</span>}
                  </span>
                  <span className="text-sm text-muted">
                    {formatDuration(s.duration_minutes)}
                    {s.price > 0 && ` · ${formatMoney(s.price, business.currency)}`}
                    {resources.length > 1 && ` · ${doers(s.id).map((r) => r.name).join(", ")}`}
                  </span>
                </span>
                <span className="text-sm text-brand group-open:hidden">Editar</span>
              </summary>
              <div className="border-t border-line p-4">
                <ServiceForm slug={slug} businessId={business.id} service={s} isRestaurant={business.category === "restaurante"} />
                {resources.length > 1 && (
                  <div className="mt-4 rounded-xl border border-line p-3">
                    <p className="font-medium">¿Quién lo hace?</p>
                    <p className="mb-2 text-xs text-muted">Los clientes solo podrán elegir a quienes marques.</p>
                    <ActionForm
                      action={saveServiceResourcesAction}
                      submit="Guardar"
                      buttonClass="btn-ghost w-full"
                      hidden={{ slug, business_id: business.id, service_id: s.id }}
                    >
                      {resources.map((r) => (
                        <label key={r.id} className="flex items-center gap-2">
                          <input type="hidden" name="all_resource_ids" value={r.id} />
                          <input
                            type="checkbox"
                            name="resource_ids"
                            value={r.id}
                            defaultChecked={doers(s.id).some((d) => d.id === r.id)}
                            className="h-5 w-5 accent-brand"
                          />
                          {r.name}
                        </label>
                      ))}
                    </ActionForm>
                  </div>
                )}
                <form action={deleteServiceAction} className="mt-3">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <button className="text-sm text-red-700 underline underline-offset-4">
                    Eliminar servicio (si ya tiene citas, solo se oculta)
                  </button>
                </form>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Nuevo servicio</h2>
        <ServiceForm slug={slug} businessId={business.id} isRestaurant={business.category === "restaurante"} />
      </section>
    </div>
  );
}
