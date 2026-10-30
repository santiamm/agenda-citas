"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import type { Service } from "@/lib/types";
import { saveServiceAction } from "../../actions";

export function ServiceForm({
  slug,
  businessId,
  service,
  isRestaurant,
}: {
  slug: string;
  businessId: string;
  service?: Service;
  isRestaurant?: boolean;
}) {
  const [state, action, pending] = useActionState(saveServiceAction, undefined);
  const id = service?.id ?? "nuevo";
  return (
    <form action={action} className="space-y-3" key={service ? undefined : state?.ok}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="business_id" value={businessId} />
      {service && <input type="hidden" name="id" value={service.id} />}
      <div>
        <label className="label" htmlFor={`name-${id}`}>
          Nombre
        </label>
        <input id={`name-${id}`} name="name" className="input" defaultValue={service?.name} required maxLength={80} />
      </div>
      <div>
        <label className="label" htmlFor={`desc-${id}`}>
          Descripción <span className="font-normal text-muted">(opcional)</span>
        </label>
        <input id={`desc-${id}`} name="description" className="input" defaultValue={service?.description ?? ""} maxLength={300} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`dur-${id}`}>
            Duración (min)
          </label>
          <input
            id={`dur-${id}`}
            name="duration_minutes"
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            step={5}
            className="input"
            defaultValue={service?.duration_minutes ?? 30}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor={`price-${id}`}>
            Precio <span className="font-normal text-muted">(0 = no mostrar)</span>
          </label>
          <input
            id={`price-${id}`}
            name="price"
            type="number"
            inputMode="numeric"
            min={0}
            step={500}
            className="input"
            defaultValue={service?.price ?? 0}
          />
        </div>
      </div>
      {isRestaurant && (
        <div>
          <label className="label" htmlFor={`party-${id}`}>
            Personas mínimas en la mesa
          </label>
          <input
            id={`party-${id}`}
            name="min_party"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className="input"
            defaultValue={service?.min_party ?? 0}
          />
          <p className="mt-1 text-xs text-muted">Solo se ofrecen mesas con al menos esa capacidad. 0 = cualquier mesa.</p>
        </div>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" name="is_active" defaultChecked={service?.is_active ?? true} className="h-5 w-5 accent-brand" />
        Visible para reservar
      </label>
      <FormStatus state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Guardando…" : service ? "Guardar cambios" : "Agregar servicio"}
      </button>
    </form>
  );
}
