import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Business, Resource, Service, WorkingHour } from "@/lib/types";

/** Datos públicos de un negocio para su página de reservas. */
export const getPublicBusiness = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle<Business>();
  if (!business) return null;
  const [services, resources, hours, resourceServices] = await Promise.all([
    supabase.from("services").select("*").eq("business_id", business.id).eq("is_active", true).order("sort").order("name"),
    supabase.from("resources").select("*").eq("business_id", business.id).eq("is_active", true).order("sort").order("name"),
    supabase.from("working_hours").select("*").eq("business_id", business.id).order("weekday").order("start_time"),
    supabase.from("resource_services").select("resource_id, service_id").eq("business_id", business.id),
  ]);
  return {
    business,
    services: (services.data ?? []) as Service[],
    resources: (resources.data ?? []) as Resource[],
    hours: (hours.data ?? []) as WorkingHour[],
    resourceServices: (resourceServices.data ?? []) as { resource_id: string; service_id: string }[],
  };
});
