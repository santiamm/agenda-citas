import type { Metadata } from "next";
import { formatDuration, formatMoney } from "@/lib/format";
import { getOwnerBusiness } from "@/lib/owner";
import type { Service } from "@/lib/types";
import { deleteServiceAction } from "../../actions";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServicesPage({ params }: PageProps<"/panel/[slug]/servicios">) {
  const { slug } = await params;
  const { supabase, business } = await getOwnerBusiness(slug);
  const { data } = await supabase.from("services").select("*").eq("business_id", business.id).order("sort").order("name");
  const services = (data ?? []) as Service[];

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
                  </span>
                </span>
                <span className="text-sm text-brand group-open:hidden">Editar</span>
              </summary>
              <div className="border-t border-line p-4">
                <ServiceForm slug={slug} businessId={business.id} service={s} />
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
        <ServiceForm slug={slug} businessId={business.id} />
      </section>
    </div>
  );
}
