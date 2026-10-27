import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking-flow";
import { getPublicBusiness } from "@/lib/data";
import { WEEKDAYS_SHORT, whatsappLink } from "@/lib/format";
import type { WorkingHour } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicBusiness(slug);
  if (!data) return { title: "Negocio no encontrado" };
  return {
    title: `Reservar en ${data.business.name}`,
    description: data.business.description ?? `Agenda tu cita en ${data.business.name} en línea.`,
    manifest: `/b/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: data.business.name },
  };
}

/** Resume el horario: "Lun–Vie 9:00–12:00, 14:00–19:00 · Sáb 8:00–14:00". */
function summarizeHours(hours: WorkingHour[]): string[] {
  const byDay = new Map<number, string>();
  for (const h of hours) {
    const range = `${h.start_time.slice(0, 5)}–${h.end_time.slice(0, 5)}`;
    const prev = byDay.get(h.weekday);
    if (!prev?.includes(range)) byDay.set(h.weekday, prev ? `${prev}, ${range}` : range);
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { days: number[]; text: string }[] = [];
  for (const d of order) {
    const text = byDay.get(d);
    if (!text) continue;
    const last = groups.at(-1);
    if (last && last.text === text && order.indexOf(last.days.at(-1)!) === order.indexOf(d) - 1) last.days.push(d);
    else groups.push({ days: [d], text });
  }
  return groups.map((g) => {
    const days =
      g.days.length > 1 ? `${WEEKDAYS_SHORT[g.days[0]]}–${WEEKDAYS_SHORT[g.days.at(-1)!]}` : WEEKDAYS_SHORT[g.days[0]];
    return `${days} ${g.text}`;
  });
}

export default async function BusinessPage({ params }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const data = await getPublicBusiness(slug);
  if (!data) notFound();
  const { business, services, resources, hours } = data;
  const schedule = summarizeHours(hours);

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-10">
      <header className="pt-6 pb-4">
        {business.is_demo && (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Negocio de ejemplo. Puedes reservar para probar: las citas se borran cada día.
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
        {business.description && <p className="mt-1 text-muted">{business.description}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {business.address && <span>📍 {business.address}</span>}
          {schedule.length > 0 && <span>🕒 {schedule.join(" · ")}</span>}
          {business.phone && !business.is_demo && (
            <a href={whatsappLink(business.phone)} className="text-brand underline underline-offset-4">
              WhatsApp
            </a>
          )}
        </div>
      </header>

      {services.length === 0 || resources.length === 0 ? (
        <div className="card p-6 text-center text-muted">Este negocio todavía no tiene servicios disponibles.</div>
      ) : (
        <BookingFlow
          business={{
            id: business.id,
            timezone: business.timezone,
            currency: business.currency,
            resource_label: business.resource_label,
            max_days_ahead: business.max_days_ahead,
          }}
          services={services}
          resources={resources}
          openWeekdays={[...new Set(hours.map((h) => h.weekday))]}
        />
      )}

      <p className="mt-10 text-center text-xs text-muted">
        Reservas con{" "}
        <Link href="/" className="underline underline-offset-4">
          Agenda Citas
        </Link>
      </p>
    </div>
  );
}
