import "server-only";
import webpush from "web-push";
import nodemailer from "nodemailer";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { formatDateLong, formatTime } from "@/lib/format";

// Avisos al dueño: notificación en el celular (Web Push) y correo (SMTP, opcional).
// Nunca deben romper una reserva: cualquier error se registra y se ignora.

export type NotifyEvent = "new" | "cancelled" | "waitlist";

type Payload = {
  business: { name: string; slug: string; timezone: string; notify_email: boolean; notify_push: boolean };
  owner_email: string | null;
  subscriptions: { endpoint: string; p256dh: string; auth: string }[];
  item: {
    customer_name: string;
    customer_phone: string | null;
    service_name: string;
    resource_name?: string;
    starts_at?: string;
    desired_date?: string;
    source?: string;
    waiting?: number;
  };
};

/** Cliente sin sesión (las funciones de avisos se protegen con APP_SECRET). */
export function serverAnonClient() {
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
}

function compose(event: NotifyEvent, p: Payload) {
  const tz = p.business.timezone;
  const i = p.item;
  const when = i.starts_at ? `${formatDateLong(i.starts_at, tz)}, ${formatTime(i.starts_at, tz)}` : "";
  const via = i.source === "bot" ? " (por WhatsApp)" : "";
  if (event === "new")
    return {
      title: `Nueva cita${via}: ${i.customer_name}`,
      body: `${i.service_name} · ${when}${i.resource_name ? ` · con ${i.resource_name}` : ""}`,
      url: `/panel/${p.business.slug}`,
    };
  if (event === "cancelled")
    return {
      title: `Cita cancelada: ${i.customer_name}`,
      body: `${i.service_name} · ${when}.${i.waiting ? ` Hay ${i.waiting} en lista de espera ese día.` : ""}`,
      url: `/panel/${p.business.slug}`,
    };
  return {
    title: `Lista de espera: ${i.customer_name}`,
    body: `Quiere ${i.service_name} el ${i.desired_date}. Escríbele si se libera una hora.`,
    url: `/panel/${p.business.slug}/espera`,
  };
}

let vapidReady = false;
function setupVapid() {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  vapidReady = true;
  return true;
}

type PushSub = { endpoint: string; p256dh: string; auth: string };

/** Envía una notificación a varios celulares. Llama a onGone con los que ya no existen. */
export async function sendPush(
  subs: PushSub[],
  msg: { title: string; body: string; url: string },
  onGone: (endpoint: string) => PromiseLike<unknown>,
): Promise<number> {
  if (!subs.length || !setupVapid()) return 0;
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), {
          TTL: 60 * 60 * 12,
          urgency: "high",
        })
        .catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 404 || err.statusCode === 410) await onGone(s.endpoint);
          throw err;
        }),
    ),
  );
  return results.filter((r) => r.status === "fulfilled").length;
}

function mailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function notifyOwner(event: NotifyEvent, kind: "appointment" | "waitlist", id: string) {
  const secret = process.env.APP_SECRET;
  if (!secret) return;
  try {
    const supabase = serverAnonClient();
    const { data, error } = await supabase.rpc("notification_payload", { p_secret: secret, p_kind: kind, p_id: id });
    if (error || !data) return;
    const p = data as Payload;
    const msg = compose(event, p);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agenda-citas-eight.vercel.app";
    const jobs: Promise<unknown>[] = [];

    if (p.business.notify_push && p.subscriptions.length && setupVapid()) {
      for (const s of p.subscriptions) {
        jobs.push(
          webpush
            .sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify(msg),
              { TTL: 60 * 60 * 12, urgency: "high" },
            )
            .catch(async (err: { statusCode?: number }) => {
              // El celular ya no acepta avisos (desinstaló o revocó el permiso).
              if (err.statusCode === 404 || err.statusCode === 410) {
                await supabase.rpc("drop_push_subscription", { p_secret: secret, p_endpoint: s.endpoint });
              }
            }),
        );
      }
    }

    const transport = p.business.notify_email && p.owner_email ? mailer() : null;
    if (transport) {
      jobs.push(
        transport
          .sendMail({
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to: p.owner_email!,
            subject: `${msg.title} · ${p.business.name}`,
            text: `${msg.body}\n\nAbre tu agenda: ${appUrl}${msg.url}`,
          })
          .catch((e) => console.error("correo", e)),
      );
    }
    await Promise.allSettled(jobs);
  } catch (e) {
    console.error("notifyOwner", e);
  }
}
