import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { runBot } from "@/lib/bot-runtime";
import { serverAnonClient } from "@/lib/notify";

// Webhook de la plataforma oficial de WhatsApp Business (Meta Cloud API).
// Inactivo hasta configurar WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN y WHATSAPP_APP_SECRET, y poner el
// phone_number_id de Meta en businesses.whatsapp_phone_number_id del negocio.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type Incoming = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: { from: string; type: string; text?: { body: string }; interactive?: { list_reply?: { id: string }; button_reply?: { id: string } } }[];
      };
    }[];
  }[];
};

function validSignature(body: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

async function sendText(phoneNumberId: string, to: string, text: string) {
  await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } }),
  });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!process.env.WHATSAPP_TOKEN || !validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const body = JSON.parse(raw) as Incoming;
  const value = body.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  const phoneNumberId = value?.metadata?.phone_number_id;
  // Meta exige responder 200 rápido; el bot trabaja después.
  if (msg && phoneNumberId) {
    after(async () => {
      const { data: biz } = await serverAnonClient()
        .from("businesses")
        .select("id")
        .eq("whatsapp_phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!biz) return;
      const text = msg.text?.body ?? msg.interactive?.list_reply?.id ?? msg.interactive?.button_reply?.id ?? "";
      const replies = await runBot(biz.id, msg.from, text);
      for (const r of replies) await sendText(phoneNumberId, msg.from, r);
    });
  }
  return new Response("ok", { status: 200 });
}
