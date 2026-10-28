import "server-only";
import { handleMessage, type BotBusiness, type BotState } from "@/lib/bot";
import { friendlyError, WEEKDAYS_SHORT } from "@/lib/format";
import { notifyOwner, serverAnonClient } from "@/lib/notify";

/** Procesa un mensaje del cliente para un negocio y guarda el estado de la conversación. */
export async function runBot(businessId: string, rawPhone: string, text: string): Promise<string[]> {
  const secret = process.env.APP_SECRET;
  if (!secret) return ["El bot no está configurado (falta APP_SECRET)."];
  const phone = rawPhone.replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, ""); // +57 300... → 300...
  const supabase = serverAnonClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agenda-citas-eight.vercel.app";

  const { data: business } = await supabase.from("businesses").select("*").eq("id", businessId).maybeSingle<BotBusiness>();
  if (!business) return ["Negocio no encontrado."];
  const [svc, res, rs, hrs, session] = await Promise.all([
    supabase.from("services").select("id, name, duration_minutes, price").eq("business_id", businessId).eq("is_active", true).order("sort"),
    supabase.from("resources").select("id, name").eq("business_id", businessId).eq("is_active", true).order("sort"),
    supabase.from("resource_services").select("resource_id, service_id").eq("business_id", businessId),
    supabase.from("working_hours").select("weekday, start_time, end_time").eq("business_id", businessId).order("start_time"),
    supabase.rpc("bot_load_session", { p_secret: secret, p_business_id: businessId, p_phone: phone }),
  ]);
  const hours = hrs.data ?? [];
  const byDay = new Map<number, string[]>();
  for (const h of hours) {
    const r = `${h.start_time.slice(0, 5)}–${h.end_time.slice(0, 5)}`;
    const list = byDay.get(h.weekday) ?? [];
    if (!list.includes(r)) list.push(r);
    byDay.set(h.weekday, list);
  }
  const hoursText =
    [1, 2, 3, 4, 5, 6, 0]
      .filter((d) => byDay.has(d))
      .map((d) => `${WEEKDAYS_SHORT[d]} ${byDay.get(d)!.join(", ")}`)
      .join(" · ") || "Sin horario publicado";

  const result = await handleMessage((session.data as BotState | null) ?? null, text, {
    business,
    appUrl,
    services: (svc.data ?? []).map((s) => ({ ...s, price: Number(s.price) })),
    resources: res.data ?? [],
    resourceServices: rs.data ?? [],
    openWeekdays: [...byDay.keys()],
    hoursText,
    savedName: null,
    slots: async (serviceId, date, resourceId) => {
      const { data } = await supabase.rpc("get_available_slots", {
        p_business_id: businessId,
        p_service_id: serviceId,
        p_date: date,
        p_resource_id: resourceId,
      });
      return [...new Map(((data ?? []) as { starts_at: string }[]).map((s) => [s.starts_at, s])).values()];
    },
    book: async ({ serviceId, startsAt, name, resourceId }) => {
      const { data, error } = await supabase.rpc("create_booking", {
        p_business_id: businessId,
        p_service_id: serviceId,
        p_starts_at: startsAt,
        p_customer_name: name,
        p_customer_phone: phone,
        p_resource_id: resourceId,
        p_notes: null,
        p_source: "bot",
      });
      const row = (data as { appointment_id: string; cancel_token: string; resource_name: string }[] | null)?.[0];
      if (error || !row) return { error: friendlyError(error?.message) };
      await notifyOwner("new", "appointment", row.appointment_id);
      return { token: row.cancel_token, resourceName: row.resource_name };
    },
    bookings: async () => {
      const { data } = await supabase.rpc("bot_customer_bookings", { p_secret: secret, p_business_id: businessId, p_phone: phone });
      return data ?? [];
    },
    cancel: async (token) => {
      const { error } = await supabase.rpc("cancel_booking", { p_token: token });
      if (error) return { error: friendlyError(error.message) };
      const { data } = await supabase.rpc("get_booking", { p_token: token });
      const id = (data as { appointment_id: string }[] | null)?.[0]?.appointment_id;
      if (id) await notifyOwner("cancelled", "appointment", id);
      return {};
    },
    membership: async () => {
      const { data } = await supabase.rpc("bot_customer_membership", { p_secret: secret, p_business_id: businessId, p_phone: phone });
      return data ?? [];
    },
  });

  await supabase.rpc("bot_save_session", { p_secret: secret, p_business_id: businessId, p_phone: phone, p_state: result.state });
  return result.replies;
}
