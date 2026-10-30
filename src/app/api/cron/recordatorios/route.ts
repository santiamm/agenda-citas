import { formatTime } from "@/lib/format";
import { sendPush, serverAnonClient } from "@/lib/notify";

// Tarea diaria (Vercel Cron, ver vercel.json): a las 6 p. m. de Bogotá recuerda a los clientes
// que pidieron aviso su cita de mañana y le manda al dueño un resumen del día siguiente.

type Due = {
  appointment_id: string;
  cancel_token: string;
  starts_at: string;
  timezone: string;
  business_name: string;
  service_name: string;
  resource_name: string;
  subscriptions: { endpoint: string; p256dh: string; auth: string }[];
};
type Summary = {
  business_name: string;
  slug: string;
  total: number;
  pending: number;
  subscriptions: { endpoint: string; p256dh: string; auth: string }[] | null;
};

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const secret = process.env.APP_SECRET;
  if (!cronSecret || !secret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Forbidden", { status: 403 });
  }
  const supabase = serverAnonClient();

  const due = ((await supabase.rpc("reminders_due", { p_secret: secret })).data ?? []) as Due[];
  let reminded = 0;
  const done: string[] = [];
  for (const a of due) {
    reminded += await sendPush(
      a.subscriptions,
      {
        title: `Mañana: ${a.service_name} a las ${formatTime(a.starts_at, a.timezone)}`,
        body: `${a.business_name}, con ${a.resource_name}. Si no puedes ir, toca para cancelar.`,
        url: `/cita/${a.cancel_token}`,
      },
      (endpoint) => supabase.rpc("drop_booking_push", { p_secret: secret, p_endpoint: endpoint }),
    );
    done.push(a.appointment_id);
  }
  if (done.length) await supabase.rpc("mark_reminded", { p_secret: secret, p_ids: done });

  const summaries = ((await supabase.rpc("owner_daily_summary", { p_secret: secret })).data ?? []) as Summary[];
  let owners = 0;
  for (const s of summaries) {
    owners += await sendPush(
      s.subscriptions ?? [],
      {
        title: `Mañana tienes ${s.total} ${s.total === 1 ? "cita" : "citas"}`,
        body: s.pending ? `${s.pending} por confirmar en ${s.business_name}.` : `Todo confirmado en ${s.business_name}.`,
        url: `/panel/${s.slug}`,
      },
      (endpoint) => supabase.rpc("drop_push_subscription", { p_secret: secret, p_endpoint: endpoint }),
    );
  }

  return Response.json({ reminders: due.length, reminderPushes: reminded, ownerPushes: owners });
}
