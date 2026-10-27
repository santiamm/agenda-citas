import Link from "next/link";
import { setStatusAction } from "@/app/panel/actions";
import { addDays, dayChip, formatDateLong, formatTime, todayIn, whatsappLink, zonedToUtc } from "@/lib/format";
import { STATUS_LABEL, type AgendaItem, type AppointmentStatus } from "@/lib/types";

type Props = {
  items: AgendaItem[];
  date: string;
  tz: string;
  basePath: string; // a dónde apuntan las flechas de día (/panel/slug o /demo)
  slug: string;
  businessName: string;
  readOnly?: boolean;
};

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-brand-soft text-brand",
  completed: "bg-stone-200 text-stone-700",
  cancelled: "bg-red-50 text-red-700 line-through",
  no_show: "bg-red-50 text-red-700",
};

export function AgendaView({ items, date, tz, basePath, slug, businessName, readOnly }: Props) {
  const today = todayIn(tz);
  const active = items.filter((i) => i.status !== "cancelled");
  const pending = items.filter((i) => i.status === "pending").length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 3));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{formatDateLong(zonedToUtc(date, "12:00", tz), tz)}</h1>
          <p className="text-sm text-muted">
            {active.length === 0
              ? "Sin citas"
              : `${active.length} ${active.length === 1 ? "cita" : "citas"}${pending ? ` · ${pending} por confirmar` : ""}`}
          </p>
        </div>
        {date !== today && (
          <Link href={`${basePath}?d=${today}`} className="btn-ghost text-sm">
            Hoy
          </Link>
        )}
      </div>

      <nav className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Cambiar de día">
        <Link href={`${basePath}?d=${addDays(date, -7)}`} className="btn-ghost shrink-0 px-3" aria-label="Semana anterior">
          ‹
        </Link>
        {week.map((d) => {
          const chip = dayChip(d, tz);
          return (
            <Link
              key={d}
              href={`${basePath}?d=${d}`}
              aria-current={d === date ? "date" : undefined}
              className={`flex min-w-14 shrink-0 flex-col items-center rounded-xl border px-2 py-1.5 text-xs ${
                d === date ? "border-ink bg-ink text-white" : "border-line bg-white"
              }`}
            >
              <span className="font-medium">{chip.top}</span>
              <span className={d === date ? "text-white/70" : "text-muted"}>{chip.bottom}</span>
            </Link>
          );
        })}
        <Link href={`${basePath}?d=${addDays(date, 7)}`} className="btn-ghost shrink-0 px-3" aria-label="Semana siguiente">
          ›
        </Link>
      </nav>

      <ul className="mt-4 space-y-2">
        {items.length === 0 && (
          <li className="card p-6 text-center text-muted">
            No hay citas este día.
            {!readOnly && (
              <>
                {" "}
                Comparte tu enlace{" "}
                <Link href={`/b/${slug}`} className="text-brand underline underline-offset-4">
                  /b/{slug}
                </Link>{" "}
                para recibir reservas.
              </>
            )}
          </li>
        )}
        {items.map((a) => (
          <li key={a.id} className={`card p-4 ${a.status === "cancelled" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold tabular-nums">
                  {formatTime(a.starts_at, tz)}
                  <span className="text-sm font-normal text-muted"> – {formatTime(a.ends_at, tz)}</span>
                </p>
                <p className="truncate font-medium">{a.customer_name}</p>
                <p className="text-sm text-muted">
                  {a.service_name} · {a.resource_name}
                </p>
                {a.notes && <p className="mt-1 text-sm italic text-ink/80">“{a.notes}”</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[a.status]}`}>
                {STATUS_LABEL[a.status]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {readOnly ? (
                <span className="text-xs text-muted">Panel de ejemplo: los botones están desactivados.</span>
              ) : (
                <>
                  {a.status === "pending" && <StatusButton a={a} slug={slug} date={date} to="confirmed" label="Confirmar" primary />}
                  {(a.status === "pending" || a.status === "confirmed") && (
                    <StatusButton a={a} slug={slug} date={date} to="cancelled" label="Cancelar" />
                  )}
                  {a.status === "confirmed" && new Date(a.starts_at) <= new Date() && (
                    <>
                      <StatusButton a={a} slug={slug} date={date} to="completed" label="Atendida" primary />
                      <StatusButton a={a} slug={slug} date={date} to="no_show" label="No vino" />
                    </>
                  )}
                  {(a.status === "cancelled" || a.status === "no_show") && new Date(a.starts_at) > new Date() && (
                    <StatusButton a={a} slug={slug} date={date} to="confirmed" label="Reactivar" />
                  )}
                  {a.status !== "cancelled" && (
                    <a
                      href={whatsappLink(
                        a.customer_phone,
                        `Hola ${a.customer_name.split(" ")[0]}, te escribimos de ${businessName} por tu cita de ${a.service_name} el ${formatDateLong(a.starts_at, tz).toLowerCase()} a las ${formatTime(a.starts_at, tz)}.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost min-h-9 px-3 text-sm"
                    >
                      WhatsApp
                    </a>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusButton({
  a,
  slug,
  date,
  to,
  label,
  primary,
}: {
  a: AgendaItem;
  slug: string;
  date: string;
  to: AppointmentStatus;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="d" value={date} />
      <input type="hidden" name="status" value={to} />
      <button
        type="submit"
        className={`${primary ? "btn-primary" : to === "cancelled" || to === "no_show" ? "btn-danger" : "btn-ghost"} min-h-9 px-3 text-sm`}
      >
        {label}
      </button>
    </form>
  );
}
