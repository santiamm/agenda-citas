"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/format";

export async function cancelBookingAction(token: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_token: token });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath(`/cita/${token}`);
}
