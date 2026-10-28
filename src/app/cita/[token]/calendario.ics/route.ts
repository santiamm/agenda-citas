import { createClient } from "@/lib/supabase/server";
import { icsFile } from "@/lib/calendar";

export async function GET(req: Request, ctx: RouteContext<"/cita/[token]/calendario.ics">) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("No encontrada", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_booking", { p_token: token });
  const b = (data as Record<string, string>[] | null)?.[0];
  if (!b) return new Response("No encontrada", { status: 404 });
  const origin = new URL(req.url).origin;
  const ics = icsFile({
    uid: b.appointment_id,
    title: `${b.service_name} · ${b.business_name}`,
    start: b.starts_at,
    end: b.ends_at,
    location: b.business_address,
    details: `Con ${b.resource_name}. Ver o cancelar: ${origin}/cita/${token}`,
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mi-cita.ics"',
    },
  });
}
