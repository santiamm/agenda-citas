import type { Metadata } from "next";
import Link from "next/link";
import { AgendaView } from "@/components/agenda-view";
import { dayRange, formatDateLong, formatTime, todayIn, whatsappLink } from "@/lib/format";
import { APPOINTMENT_SELECT, getOwnerBusiness, toAgendaItems, type AppointmentRow } from "@/lib/owner";
import type { MembershipRow, WaitlistItem } from "@/lib/types";
import { ShareLink } from "./share-link";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ params, searchParams }: PageProps<"/panel/[slug]">) {
  const { slug } = await params;
  const { d, error, bienvenida } = await searchParams;
  const { supabase, business } = await getOwnerBusiness(slug);
  const tz = business.timezone;
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIn(tz);
  const [from, to] = dayRange(date, tz);

  const [day, pending, memberships, planServices, waitlist] = await Promise.all([
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("business_id", business.id)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at")
      .returns<AppointmentRow[]>(),
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("business_id", business.id)
      .eq("status", "pending")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(10)
      .returns<AppointmentRow[]>(),
    supabase.rpc("membership_overview", { p_business_id: business.id }),
    supabase.from("plan_services").select("plan_id, service_id").eq("business_id", business.id),
    supabase
      .from("waitlist")
      .select("*, services(name)")
      .eq("business_id", business.id)
      .eq("desired_date", date)
      .eq("status", "waiting")
      .order("created_at")
      .returns<WaitlistItem[]>(),
  ]);
  const members = (memberships.data ?? []) as MembershipRow[];
  const ps = planServices.data ?? [];
  const otherPending = toAgendaItems(pending.data ?? []).filter((p) => p.starts_at < from || p.starts_at >= to);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agenda-citas-eight.vercel.app";

  return (
    <div className="space-y-6">
      {bienvenida && (
        <div className="card border-brand bg-brand-soft p-4">
          <p className="font-semibold">¡Tu negocio está listo! 🎉</p>
          <p className="mt-1 text-sm">
            Revisa tus <Link href={`/panel/${slug}/servicios`} className="underline">servicios</Link> y tu{" "}
            <Link href={`/panel/${slug}/horario`} className="underline">horario</Link>, activa los{" "}
            <Link href={`/panel/${slug}/ajustes`} className="underline">avisos</Link> y comparte tu enlace.
          </p>
          <div className="mt-3">
            <ShareLink slug={slug} name={business.name} />
          </div>
        </div>
      )}

      {typeof error === "string" && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">
          {error}
        </p>
      )}

      {otherPending.length > 0 && (
        <section className="card border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">Por confirmar en otros días</p>
          <ul className="mt-2 space-y-1 text-sm">
            {otherPending.map((p) => (
              <li key={p.id}>
                <Link href={`/panel/${slug}?d=${todayIn(tz, new Date(p.starts_at))}`} className="underline underline-offset-4">
                  {formatDateLong(p.starts_at, tz)}, {formatTime(p.starts_at, tz)}
                </Link>{" "}
                · {p.customer_name} · {p.service_name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AgendaView
        items={toAgendaItems(day.data ?? [], members, ps)}
        date={date}
        tz={tz}
        basePath={`/panel/${slug}`}
        slug={slug}
        businessName={business.name}
        appUrl={appUrl}
      />

      {(waitlist.data ?? []).length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">Lista de espera para este día</h2>
          <p className="text-sm text-muted">Si se libera una hora, escríbeles. Gestiona todo en Más → Lista de espera.</p>
          <ul className="mt-3 space-y-2">
            {(waitlist.data ?? []).map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{w.customer_name}</span> · {w.services?.name}
                </span>
                <a
                  className="btn-ghost min-h-9 px-3 text-sm"
                  target="_blank"
                  rel="noreferrer"
                  href={whatsappLink(
                    w.customer_phone,
                    `Hola ${w.customer_name.split(" ")[0]}, se liberó una hora en ${business.name} para ${w.services?.name}. Resérvala aquí: ${appUrl}/b/${slug}`,
                  )}
                >
                  WhatsApp
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
