import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import type { AgendaItem, Business, MembershipRow } from "@/lib/types";

/** Negocio del usuario logueado por slug. Si no es suyo, 404 (no revelamos que existe). */
export const getOwnerBusiness = cache(async (slug: string) => {
  const { supabase, user } = await getUser();
  if (!user) redirect(`/entrar?siguiente=/panel/${slug}`);
  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .eq("owner_id", user.id)
    .maybeSingle<Business>();
  if (!business) notFound();
  return { supabase, user, business };
});

export const APPOINTMENT_SELECT =
  "id, starts_at, ends_at, status, customer_name, customer_phone, notes, cancel_token, customer_id, source, service_id, services(name), resources(name)";

export type AppointmentRow = Omit<AgendaItem, "service_name" | "resource_name" | "member"> & {
  service_id: string;
  services: { name: string } | null;
  resources: { name: string } | null;
};

/** Convierte filas de citas en items de agenda y marca las cubiertas por una mensualidad al día. */
export function toAgendaItems(
  rows: AppointmentRow[],
  memberships: MembershipRow[] = [],
  planServices: { plan_id: string; service_id: string }[] = [],
  tz = "America/Bogota",
): AgendaItem[] {
  return rows.map((r) => {
    const day = todayIn(tz, new Date(r.starts_at)); // fecha local del negocio, no UTC
    const member = memberships.some((m) => {
      if (m.customer_id !== r.customer_id || m.status === "cancelled" || !m.paid_until || m.paid_until < day) return false;
      const covered = planServices.filter((ps) => ps.plan_id === m.plan_id);
      return covered.length === 0 || covered.some((ps) => ps.service_id === r.service_id);
    });
    return { ...r, service_name: r.services?.name ?? "", resource_name: r.resources?.name ?? "", member };
  });
}
