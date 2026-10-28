"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/format";
import { notifyOwner } from "@/lib/notify";

export async function cancelBookingAction(token: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_token: token });
  if (error) return { error: friendlyError(error.message) };
  const { data } = await supabase.rpc("get_booking", { p_token: token });
  const id = (data as { appointment_id: string }[] | null)?.[0]?.appointment_id;
  if (id) after(() => notifyOwner("cancelled", "appointment", id));
  revalidatePath(`/cita/${token}`);
}
