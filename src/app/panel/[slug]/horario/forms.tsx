"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { WEEKDAYS, todayIn } from "@/lib/format";
import type { Resource, WorkingHour } from "@/lib/types";
import { addTimeOffAction, saveHoursAction, saveResourceAction } from "../../actions";

export function ResourceForm({
  slug,
  businessId,
  resource,
  copyFrom,
  isRestaurant,
}: {
  slug: string;
  businessId: string;
  resource?: Resource;
  copyFrom?: string;
  isRestaurant?: boolean;
}) {
  const [state, action, pending] = useActionState(saveResourceAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="business_id" value={businessId} />
      {resource && <input type="hidden" name="id" value={resource.id} />}
      {copyFrom && <input type="hidden" name="copy_from" value={copyFrom} />}
      <div className="flex gap-2">
        <input
          name="name"
          aria-label="Nombre"
          className="input"
          defaultValue={resource?.name}
          placeholder="Nombre"
          required
          maxLength={60}
        />
        {isRestaurant && (
          <input
            name="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            aria-label="Capacidad (personas)"
            title="Capacidad (personas)"
            placeholder="Pers."
            defaultValue={resource?.capacity ?? ""}
            className="input w-24 shrink-0"
          />
        )}
        <button className={resource ? "btn-ghost shrink-0" : "btn-primary shrink-0"} disabled={pending}>
          {resource ? "Guardar" : "Agregar"}
        </button>
      </div>
      {resource ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={resource.is_active} className="h-5 w-5 accent-brand" />
          Recibe reservas
        </label>
      ) : (
        copyFrom && <p className="text-xs text-muted">Empieza con el mismo horario del primero; luego lo ajustas.</p>
      )}
      <FormStatus state={state} />
    </form>
  );
}

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursForm({
  slug,
  businessId,
  resourceId,
  hours,
}: {
  slug: string;
  businessId: string;
  resourceId: string;
  hours: WorkingHour[];
}) {
  const [state, action, pending] = useActionState(saveHoursAction, undefined);
  const initial = Object.fromEntries(
    ORDER.map((d) => {
      const ranges = hours.filter((h) => h.weekday === d).map((h) => [h.start_time.slice(0, 5), h.end_time.slice(0, 5)]);
      return [d, { on: ranges.length > 0, split: ranges.length > 1, ranges }];
    }),
  );
  const [days, setDays] = useState(initial);
  const toggle = (d: number, key: "on" | "split") => setDays((p) => ({ ...p, [d]: { ...p[d], [key]: !p[d][key] } }));

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="resource_id" value={resourceId} />
      {ORDER.map((d) => {
        const day = days[d];
        return (
          <div key={d} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  name={`d${d}_on`}
                  checked={day.on}
                  onChange={() => toggle(d, "on")}
                  className="h-5 w-5 accent-brand"
                />
                {WEEKDAYS[d]}
              </label>
              {day.on ? (
                <button type="button" className="text-xs text-brand underline" onClick={() => toggle(d, "split")}>
                  {day.split ? "Un solo tramo" : "+ Partir (almuerzo)"}
                </button>
              ) : (
                <span className="text-sm text-muted">Cerrado</span>
              )}
            </div>
            {day.on &&
              (day.split ? [0, 1] : [0]).map((i) => (
                <div key={i} className="mt-2 flex items-center gap-2">
                  <input
                    type="time"
                    name={`d${d}_start${i}`}
                    aria-label={`${WEEKDAYS[d]} apertura ${i + 1}`}
                    defaultValue={day.ranges[i]?.[0] ?? (i ? "14:00" : "09:00")}
                    className="input"
                    required
                  />
                  <span className="text-muted">a</span>
                  <input
                    type="time"
                    name={`d${d}_end${i}`}
                    aria-label={`${WEEKDAYS[d]} cierre ${i + 1}`}
                    defaultValue={day.ranges[i]?.[1] ?? (i ? "19:00" : day.split ? "12:00" : "18:00")}
                    className="input"
                    required
                  />
                </div>
              ))}
          </div>
        );
      })}
      <FormStatus state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar horario"}
      </button>
    </form>
  );
}

export function TimeOffForm({
  slug,
  businessId,
  timezone,
  resources,
}: {
  slug: string;
  businessId: string;
  timezone: string;
  resources: Resource[];
}) {
  const [state, action, pending] = useActionState(addTimeOffAction, undefined);
  const [allDay, setAllDay] = useState(true);
  const today = todayIn(timezone);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="timezone" value={timezone} />
      <h3 className="font-semibold">Nuevo bloqueo</h3>
      <div>
        <label className="label" htmlFor="to-res">
          ¿Para quién?
        </label>
        <select id="to-res" name="resource_id" className="input">
          <option value="">Todo el negocio</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="all_day"
          checked={allDay}
          onChange={() => setAllDay(!allDay)}
          className="h-5 w-5 accent-brand"
        />
        Días completos
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="from_date">
            Desde
          </label>
          <input id="from_date" type="date" name="from_date" min={today} defaultValue={today} className="input" required />
          {!allDay && <input type="time" name="from_time" aria-label="Hora desde" defaultValue="12:00" className="input mt-2" />}
        </div>
        <div>
          <label className="label" htmlFor="to_date">
            Hasta
          </label>
          <input id="to_date" type="date" name="to_date" min={today} defaultValue={today} className="input" required />
          {!allDay && <input type="time" name="to_time" aria-label="Hora hasta" defaultValue="14:00" className="input mt-2" />}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="reason">
          Motivo <span className="font-normal text-muted">(opcional, solo lo ves tú)</span>
        </label>
        <input id="reason" name="reason" className="input" placeholder="Festivo, vacaciones…" maxLength={120} />
      </div>
      <p className="text-xs text-muted">Las citas que ya existan en ese rango no se cancelan solas: revísalas en la agenda.</p>
      <FormStatus state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Guardando…" : "Bloquear"}
      </button>
    </form>
  );
}
