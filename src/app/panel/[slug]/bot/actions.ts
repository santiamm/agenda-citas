"use server";

import { runBot } from "@/lib/bot-runtime";
import { getOwnerBusiness } from "@/lib/owner";

/** El dueño prueba el bot como si fuera un cliente con el teléfono indicado. */
export async function simulateBotAction(slug: string, phone: string, text: string): Promise<string[]> {
  const { business } = await getOwnerBusiness(slug);
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return ["Escribe un celular de prueba válido arriba."];
  return runBot(business.id, digits, text);
}
