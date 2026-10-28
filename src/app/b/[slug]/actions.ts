"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/format";
import { notifyOwner } from "@/lib/notify";

type BookInput = {
  businessId: string;
  serviceId: string;
  startsAt: string;
  name: string;
  phone: string;
  resourceId: string | null;
  notes: string | null;
};

export async function bookAction(input: BookInput): Promise<{ token?: string; error?: string; code?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_business_id: input.businessId,
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_customer_name: input.name,
    p_customer_phone: input.phone,
    p_resource_id: input.resourceId,
    p_notes: input.notes,
    p_source: "web",
  });
  const row = (data as { appointment_id: string; cancel_token: string }[] | null)?.[0];
  if (error || !row) return { error: friendlyError(error?.message), code: error?.message };
  // El aviso al dueño sale después de responderle al cliente, para no hacerlo esperar.
  after(() => notifyOwner("new", "appointment", row.appointment_id));
  return { token: row.cancel_token };
}

export async function joinWaitlistAction(input: {
  businessId: string;
  serviceId: string;
  date: string;
  name: string;
  phone: string;
  resourceId: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_waitlist", {
    p_business_id: input.businessId,
    p_service_id: input.serviceId,
    p_date: input.date,
    p_customer_name: input.name,
    p_customer_phone: input.phone,
    p_resource_id: input.resourceId,
  });
  if (error || !data) return { error: friendlyError(error?.message) };
  after(() => notifyOwner("waitlist", "waitlist", data as string));
  return { ok: true };
}
