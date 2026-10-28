import { ActionForm } from "@/components/action-form";
import type { Service } from "@/lib/types";
import { savePlanAction, setMembershipStatusAction } from "../../more-actions";

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  visits_per_period: number | null;
  is_active: boolean;
};

export const METHODS = ["efectivo", "nequi", "daviplata", "transferencia", "otro"];

export function MethodSelect() {
  return (
    <select name="method" className="input" aria-label="Medio de pago">
      {METHODS.map((x) => (
        <option key={x} value={x}>
          {x[0].toUpperCase() + x.slice(1)}
        </option>
      ))}
    </select>
  );
}

export function PlanFields({
  plan,
  services,
  included,
  slug,
  businessId,
}: {
  plan?: Plan;
  services: Service[];
  included: string[];
  slug: string;
  businessId: string;
}) {
  return (
    <ActionForm
      action={savePlanAction}
      submit={plan ? "Guardar plan" : "Crear plan"}
      hidden={{ slug, business_id: businessId, ...(plan ? { id: plan.id } : {}) }}
    >
      <input name="name" className="input" placeholder="Ej.: Plan 4 cortes al mes" defaultValue={plan?.name} required aria-label="Nombre del plan" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Precio mensual</label>
          <input name="price" type="number" min={0} step={1000} className="input" defaultValue={plan?.price ?? 0} />
        </div>
        <div>
          <label className="label">Visitas al mes</label>
          <input name="visits_per_period" type="number" min={0} max={100} className="input" defaultValue={plan?.visits_per_period ?? 0} />
          <p className="mt-1 text-xs text-muted">0 = ilimitadas</p>
        </div>
      </div>
      <fieldset>
        <legend className="label">Servicios incluidos</legend>
        <p className="mb-1 text-xs text-muted">Si no marcas ninguno, incluye todos.</p>
        {services.map((s) => (
          <label key={s.id} className="flex items-center gap-2">
            <input type="checkbox" name="service_ids" value={s.id} defaultChecked={included.includes(s.id)} className="h-5 w-5 accent-brand" />
            {s.name}
          </label>
        ))}
      </fieldset>
      {plan && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_active" defaultChecked={plan.is_active} className="h-5 w-5 accent-brand" />
          Plan activo (se pueden inscribir clientes)
        </label>
      )}
    </ActionForm>
  );
}

export function StatusBtn({ id, slug, to, label, danger }: { id: string; slug: string; to: string; label: string; danger?: boolean }) {
  return (
    <form action={setMembershipStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="status" value={to} />
      <button className={`${danger ? "btn-danger" : "btn-ghost"} min-h-9 px-3 text-sm`}>{label}</button>
    </form>
  );
}

export function Box({ n, label, warn, small }: { n: string; label: string; warn?: boolean; small?: boolean }) {
  return (
    <div className={`card py-3 ${warn ? "border-red-200 bg-red-50" : ""}`}>
      <p className={`${small ? "text-base" : "text-2xl"} font-semibold`}>{n}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
