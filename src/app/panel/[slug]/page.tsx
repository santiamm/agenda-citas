import type { Metadata } from "next";
import Link from "next/link";
import { AgendaView } from "@/components/agenda-view";
import { dayRange, formatDateLong, formatTime, todayIn } from "@/lib/format";
import { getOwnerBusiness } from "@/lib/owner";
import type { AgendaItem } from "@/lib/types";
import { ShareLink } from "./share-link";

export const metadata: Metadata = { title: "Agenda" };

type Row = Omit<AgendaItem, "service_name" | "resource_name"> & {
  services: { name: string } | null;
  resources: { name: string } | null;
};

const SELECT = "id, starts_at, ends_at, status, customer_name, customer_phone, notes, services(name), resources(name)";

const toItem = (r: Row): AgendaItem => ({
  ...r,
  service_name: r.services?.name ?? "",
  resource_name: r.resources?.name ?? "",
});

export default async function AgendaPage({ params, searchParams }: PageProps<"/panel/[slug]">) {
  const { slug } = await params;
  const { d, error, bienvenida } = await searchParams;
  const { supabase, business } = await getOwnerBusiness(slug);
  const tz = business.timezone;
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIn(tz);
  const [from, to] = dayRange(date, tz);

  const [day, pending] = await Promise.all([
    supabase
      .from("appointments")
      .select(SELECT)
      .eq("business_id", business.id)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at")
      .returns<Row[]>(),
    supabase
      .from("appointments")
      .select(SELECT)
      .eq("business_id", business.id)
      .eq("status", "pending")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(10)
      .returns<Row[]>(),
  ]);
  const otherPending = (pending.data ?? []).map(toItem).filter((p) => p.starts_at < from || p.starts_at >= to);

  return (
    <div className="space-y-6">
      {bienvenida && (
        <div className="card border-brand bg-brand-soft p-4">
          <p className="font-semibold">¡Tu negocio está listo! 🎉</p>
          <p className="mt-1 text-sm">
            Revisa tus <Link href={`/panel/${slug}/servicios`} className="underline">servicios</Link> y tu{" "}
            <Link href={`/panel/${slug}/horario`} className="underline">horario</Link>, y comparte tu enlace.
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
        items={(day.data ?? []).map(toItem)}
        date={date}
        tz={tz}
        basePath={`/panel/${slug}`}
        slug={slug}
        businessName={business.name}
      />
    </div>
  );
}
