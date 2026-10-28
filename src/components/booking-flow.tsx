"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bookAction, joinWaitlistAction } from "@/app/b/[slug]/actions";
import {
  addDays,
  dayChip,
  formatDuration,
  formatMoney,
  formatTime,
  friendlyError,
  todayIn,
  weekdayOf,
} from "@/lib/format";
import type { Resource, Service } from "@/lib/types";

type Props = {
  business: { id: string; timezone: string; currency: string; resource_label: string; max_days_ahead: number };
  services: Service[];
  resources: Resource[];
  resourceServices: { resource_id: string; service_id: string }[];
  openWeekdays: number[];
};

type Slot = { resource_id: string; resource_name: string; starts_at: string };

const SAVED_KEY = "agenda:cliente";

export function BookingFlow({ business, services, resources: allResources, resourceServices, openWeekdays }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const tz = business.timezone;

  const [serviceId, setServiceId] = useState<string | null>(services.length === 1 ? services[0].id : null);
  const [resourceId, setResourceId] = useState<string | null>(null); // null = cualquiera
  // Solo quienes hacen el servicio elegido (si el servicio no tiene asignados, todos).
  const resources = useMemo(() => {
    const assigned = resourceServices.filter((rs) => rs.service_id === serviceId).map((rs) => rs.resource_id);
    return assigned.length ? allResources.filter((r) => assigned.includes(r.id)) : allResources;
  }, [allResources, resourceServices, serviceId]);
  const days = useMemo(() => {
    const today = todayIn(tz);
    return Array.from({ length: Math.min(business.max_days_ahead, 21) + 1 }, (_, i) => addDays(today, i));
  }, [tz, business.max_days_ahead]);
  const [date, setDate] = useState(() => days.find((d) => openWeekdays.includes(weekdayOf(d))) ?? days[0]);
  // Cada consulta de horas se identifica por (servicio, recurso, día); lo que no coincide con la
  // selección actual se considera "cargando" o "sin elegir", sin tener que resetear estado en efectos.
  const slotsKey = `${serviceId}|${resourceId}|${date}`;
  const [result, setResult] = useState<{ key: string; slots: Slot[]; error: string | null } | null>(null);
  const [picked, setPicked] = useState<{ key: string; at: string } | null>(null);
  const loadingSlots = !!serviceId && result?.key !== slotsKey;
  const slots = result?.key === slotsKey ? result.slots : null;
  const slotError = result?.key === slotsKey ? result.error : null;
  const startsAt = picked?.key === slotsKey ? picked.at : null;
  const setStartsAt = (at: string | null) => setPicked(at ? { key: slotsKey, at } : null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /** Rellena nombre y teléfono de la última reserva hecha en este celular. */
  function prefillCustomer() {
    if (name || phone) return;
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null");
      if (saved?.name) setName(saved.name);
      if (saved?.phone) setPhone(saved.phone);
    } catch {
      // sin almacenamiento: no pasa nada
    }
  }

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    const key = slotsKey;
    supabase
      .rpc("get_available_slots", {
        p_business_id: business.id,
        p_service_id: serviceId,
        p_date: date,
        p_resource_id: resourceId,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setResult({ key, slots: (data as Slot[]) ?? [], error: error ? friendlyError(error.message) : null });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, business.id, serviceId, resourceId, date, slotsKey]);

  // Con "cualquiera" varias personas pueden estar libres a la misma hora: se muestra una vez.
  const times = useMemo(() => [...new Set((slots ?? []).map((s) => s.starts_at))], [slots]);
  const morning = times.filter((t) => Number(formatHour24(t, tz)) < 12);
  const afternoon = times.filter((t) => Number(formatHour24(t, tz)) >= 12);
  const service = services.find((s) => s.id === serviceId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceId || !startsAt) return;
    setSending(true);
    setError(null);
    const res = await bookAction({
      businessId: business.id,
      serviceId,
      startsAt,
      name,
      phone,
      resourceId,
      notes: notes || null,
    });
    if (!res.token) {
      setSending(false);
      setError(res.error ?? friendlyError(null));
      if (res.code?.includes("SLOT_")) {
        setStartsAt(null);
        setResult((prev) => prev && { ...prev, slots: prev.slots.filter((s) => s.starts_at !== startsAt) });
      }
      return;
    }
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify({ name, phone }));
      const mine = JSON.parse(localStorage.getItem("agenda:citas") ?? "[]") as string[];
      localStorage.setItem("agenda:citas", JSON.stringify([res.token, ...mine].slice(0, 20)));
    } catch {
      // sin almacenamiento
    }
    router.push(`/cita/${res.token}?nueva=1`);
  }

  return (
    <div className="space-y-6">
      <Step n={1} title="¿Qué servicio quieres?">
        <div className="space-y-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setServiceId(s.id);
                setResourceId(null);
              }}
              aria-pressed={serviceId === s.id}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                serviceId === s.id ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line bg-white hover:border-muted"
              }`}
            >
              <span>
                <span className="block font-medium">{s.name}</span>
                {s.description && <span className="block text-sm text-muted">{s.description}</span>}
              </span>
              <span className="shrink-0 text-right text-sm text-muted">
                {formatDuration(s.duration_minutes)}
                {s.price > 0 && <span className="block font-medium text-ink">{formatMoney(s.price, business.currency)}</span>}
              </span>
            </button>
          ))}
        </div>
      </Step>

      {serviceId && resources.length > 1 && (
        <Step n={2} title={`¿Con quién? (${business.resource_label.toLowerCase()})`}>
          <div className="flex flex-wrap gap-2">
            <Chip active={resourceId === null} onClick={() => setResourceId(null)}>
              Cualquiera
            </Chip>
            {resources.map((r) => (
              <Chip key={r.id} active={resourceId === r.id} onClick={() => setResourceId(r.id)}>
                {r.name}
              </Chip>
            ))}
          </div>
        </Step>
      )}

      {serviceId && (
        <Step n={resources.length > 1 ? 3 : 2} title="¿Qué día?">
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
            {days.map((d) => {
              const closed = !openWeekdays.includes(weekdayOf(d));
              const chip = dayChip(d, tz);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={closed}
                  onClick={() => setDate(d)}
                  aria-pressed={date === d}
                  className={`flex min-w-16 snap-start flex-col items-center rounded-xl border px-3 py-2 text-sm transition disabled:opacity-35 ${
                    date === d ? "border-brand bg-brand text-brand-ink" : "border-line bg-white"
                  }`}
                >
                  <span className="font-medium">{chip.top}</span>
                  <span className={date === d ? "text-brand-ink/80" : "text-muted"}>{chip.bottom}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4" aria-live="polite">
            {loadingSlots ? (
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-line/60" />
                ))}
              </div>
            ) : slotError ? (
              <p className="text-red-700">{slotError}</p>
            ) : times.length === 0 ? (
              <Waitlist
                key={slotsKey}
                onJoin={(n, p) =>
                  joinWaitlistAction({ businessId: business.id, serviceId: serviceId!, date, name: n, phone: p, resourceId })
                }
              />
            ) : (
              <div className="space-y-3">
                {[
                  ["En la mañana", morning],
                  ["En la tarde", afternoon],
                ].map(([label, list]) =>
                  (list as string[]).length ? (
                    <div key={label as string}>
                      <p className="mb-2 text-sm text-muted">{label as string}</p>
                      <div className="grid grid-cols-4 gap-2">
                        {(list as string[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setStartsAt(t);
                              prefillCustomer();
                              setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                            }}
                            aria-pressed={startsAt === t}
                            className={`min-h-11 rounded-lg border text-sm font-medium transition ${
                              startsAt === t ? "border-brand bg-brand text-brand-ink" : "border-line bg-white hover:border-brand"
                            }`}
                          >
                            {formatTime(t, tz).replace(" a. m.", "").replace(" p. m.", "")}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </Step>
      )}

      {serviceId && startsAt && service && (
        <form ref={formRef} onSubmit={submit} className="card scroll-mt-4 space-y-4 p-4">
          <div className="rounded-xl bg-brand-soft px-4 py-3">
            <p className="font-medium">{service.name}</p>
            <p className="text-sm text-ink/80">
              {dayChip(date, tz).top === "Hoy" || dayChip(date, tz).top === "Mañana"
                ? `${dayChip(date, tz).top}, ${dayChip(date, tz).bottom}`
                : new Intl.DateTimeFormat("es-CO", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(startsAt))}{" "}
              a las {formatTime(startsAt, tz)}
              {resourceId && ` · con ${resources.find((r) => r.id === resourceId)?.name}`}
            </p>
          </div>
          <div>
            <label htmlFor="nombre" className="label">
              Tu nombre
            </label>
            <input
              id="nombre"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor="telefono" className="label">
              Celular (WhatsApp)
            </label>
            <input
              id="telefono"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="300 123 4567"
              required
            />
            <p className="mt-1 text-xs text-muted">Solo lo ve el negocio, por si necesita avisarte algo.</p>
          </div>
          <div>
            <label htmlFor="nota" className="label">
              Nota <span className="font-normal text-muted">(opcional)</span>
            </label>
            <textarea
              id="nota"
              className="input min-h-20 py-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full text-base" disabled={sending}>
            {sending ? "Reservando…" : "Confirmar reserva"}
          </button>
          <p className="text-center text-xs text-muted">No necesitas crear cuenta.</p>
        </form>
      )}
    </div>
  );
}

/** Sin horas libres: el cliente puede anotarse y el dueño le escribe si algo se libera. */
function Waitlist({ onJoin }: { onJoin: (name: string, phone: string) => Promise<{ ok?: boolean; error?: string }> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<{ ok?: boolean; error?: string; sending?: boolean }>({});

  if (state.ok)
    return (
      <p className="rounded-xl bg-brand-soft px-4 py-3">
        ✓ Quedaste en la lista de espera. Si se libera una hora, el negocio te escribe por WhatsApp.
      </p>
    );
  return (
    <div className="rounded-xl bg-white px-4 py-3">
      <p className="text-muted">No quedan horas libres este día. Prueba con otro o anótate en la lista de espera.</p>
      {!open ? (
        <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setOpen(true)}>
          Avísame si se libera una hora
        </button>
      ) : (
        <form
          className="mt-3 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setState({ sending: true });
            setState(await onJoin(name, phone));
          }}
        >
          <input className="input" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} aria-label="Tu nombre" />
          <input className="input" placeholder="Celular (WhatsApp)" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required aria-label="Celular" />
          {state.error && <p className="text-sm text-red-700">{state.error}</p>}
          <button className="btn-primary w-full" disabled={state.sending}>
            {state.sending ? "Anotando…" : "Anotarme"}
          </button>
        </form>
      )}
    </div>
  );
}

function formatHour24(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date(iso));
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-full border px-4 transition ${
        active ? "border-brand bg-brand text-brand-ink" : "border-line bg-white hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}
