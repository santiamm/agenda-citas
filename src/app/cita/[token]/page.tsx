import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { googleCalendarLink } from "@/lib/calendar";
import { formatDateLong, formatTime, whatsappLink } from "@/lib/format";
import { STATUS_LABEL, type AppointmentStatus } from "@/lib/types";
import { CancelBooking } from "./cancel-booking";
import { ShareBooking } from "./share-booking";

export const metadata: Metadata = { title: "Tu cita", robots: { index: false } };

type Booking = {
  appointment_id: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  service_name: string;
  resource_name: string;
  business_name: string;
  business_slug: string;
  business_phone: string | null;
  business_address: string | null;
  timezone: string;
};

export default async function BookingPage({ params, searchParams }: PageProps<"/cita/[token]">) {
  const { token } = await params;
  const { nueva } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_booking", { p_token: token });
  const b = (data as Booking[] | null)?.[0];
  if (!b) notFound();

  const tz = b.timezone;
  const active = b.status === "pending" || b.status === "confirmed";
  const future = new Date(b.starts_at) > new Date();
  const when = `${formatDateLong(b.starts_at, tz)} a las ${formatTime(b.starts_at, tz)}`;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      {nueva && active && (
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-brand-ink">
            ✓
          </div>
          <h1 className="mt-3 text-2xl font-semibold">¡Listo, {b.customer_name.split(" ")[0]}!</h1>
          <p className="text-muted">Tu cita quedó reservada.</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-line bg-white p-5">
          <p className="text-sm text-muted">{b.business_name}</p>
          <p className="mt-1 text-xl font-semibold">{b.service_name}</p>
          <p className="mt-1">{when}</p>
          <p className="text-sm text-muted">Con {b.resource_name}</p>
          {b.business_address && <p className="mt-2 text-sm text-muted">📍 {b.business_address}</p>}
        </div>
        <div className="flex items-center justify-between bg-paper px-5 py-3 text-sm">
          <span>Estado</span>
          <span
            className={`rounded-full px-3 py-1 font-medium ${
              b.status === "confirmed"
                ? "bg-brand-soft text-brand"
                : b.status === "pending"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-stone-200 text-stone-700"
            }`}
          >
            {STATUS_LABEL[b.status]}
          </span>
        </div>
      </div>

      {b.status === "pending" && (
        <p className="mt-3 text-sm text-muted">El negocio la confirmará pronto. Puedes volver a este enlace para ver el estado.</p>
      )}

      <div className="mt-6 space-y-3">
        <ShareBooking />
        {active && future && (
          <div className="grid grid-cols-2 gap-2">
            <a
              className="btn-ghost text-sm"
              target="_blank"
              rel="noreferrer"
              href={googleCalendarLink({
                uid: b.appointment_id,
                title: `${b.service_name} · ${b.business_name}`,
                start: b.starts_at,
                end: b.ends_at,
                location: b.business_address,
                details: `Con ${b.resource_name}`,
              })}
            >
              📅 Google Calendar
            </a>
            <a className="btn-ghost text-sm" href={`/cita/${token}/calendario.ics`}>
              📅 iPhone / otro
            </a>
          </div>
        )}
        {b.business_phone && (
          <a
            href={whatsappLink(b.business_phone, `Hola, tengo una cita el ${when} (${b.service_name}). Soy ${b.customer_name}.`)}
            className="btn-ghost w-full"
          >
            Escribir al negocio por WhatsApp
          </a>
        )}
        {active && future && <CancelBooking token={token} />}
        <Link href={`/b/${b.business_slug}`} className="btn-ghost w-full">
          Reservar otra cita
        </Link>
      </div>
    </div>
  );
}
