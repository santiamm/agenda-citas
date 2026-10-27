"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import type { Business } from "@/lib/types";
import { updateBusinessAction } from "../../actions";

export function SettingsForm({ business: b }: { business: Business }) {
  const [state, action, pending] = useActionState(updateBusinessAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={b.id} />
      <input type="hidden" name="old_slug" value={b.slug} />
      <Field label="Nombre" name="name" defaultValue={b.name} required />
      <Field label="Enlace (/b/…)" name="slug" defaultValue={b.slug} required hint="Si lo cambias, el enlace viejo deja de funcionar." />
      <Field label="Descripción corta" name="description" defaultValue={b.description ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="WhatsApp" name="phone" defaultValue={b.phone ?? ""} type="tel" />
        <Field label="Dirección" name="address" defaultValue={b.address ?? ""} />
      </div>
      <Field
        label="Cómo llamas a quien atiende"
        name="resource_label"
        defaultValue={b.resource_label}
        hint="Barbero, Estilista, Mesa, Doctora…"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label="Horas cada"
          name="slot_step_minutes"
          defaultValue={b.slot_step_minutes}
          options={[5, 10, 15, 20, 30, 60].map((m) => [m, `${m} min`])}
        />
        <Select
          label="Anticipación mínima"
          name="min_notice_minutes"
          defaultValue={b.min_notice_minutes}
          options={[
            [0, "Ninguna"],
            [30, "30 min"],
            [60, "1 hora"],
            [120, "2 horas"],
            [240, "4 horas"],
            [1440, "1 día"],
          ]}
        />
        <Select
          label="Reservar hasta"
          name="max_days_ahead"
          defaultValue={b.max_days_ahead}
          options={[7, 14, 30, 60, 90].map((d) => [d, `${d} días antes`])}
        />
      </div>
      <FormStatus state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={`f-${props.name}`}>
        {label}
      </label>
      <input id={`f-${props.name}`} className="input" {...props} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: number;
  options: [number, string][];
}) {
  const list = options.some(([v]) => v === defaultValue) ? options : [...options, [defaultValue, String(defaultValue)] as [number, string]];
  return (
    <div>
      <label className="label" htmlFor={`f-${name}`}>
        {label}
      </label>
      <select id={`f-${name}`} name={name} defaultValue={defaultValue} className="input">
        {list.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
