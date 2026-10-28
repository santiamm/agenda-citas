import type { Metadata } from "next";
import { getOwnerBusiness } from "@/lib/owner";
import { BotSimulator } from "./simulator";

export const metadata: Metadata = { title: "Bot de WhatsApp" };

export default async function BotPage({ params }: PageProps<"/panel/[slug]/bot">) {
  const { slug } = await params;
  const { business } = await getOwnerBusiness(slug);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bot de WhatsApp (simulador)</h1>
        <p className="text-sm text-muted">
          Así le respondería el bot a un cliente que escribe al WhatsApp del negocio. Contesta con números. Las citas que
          reserves aquí son reales (aparecen en tu agenda como «Por WhatsApp»).
        </p>
      </div>
      <BotSimulator slug={slug} />
      <details className="card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">¿Cómo se conecta al WhatsApp de verdad?</summary>
        <div className="mt-2 space-y-2 text-muted">
          <p>
            Usa la plataforma oficial de WhatsApp Business de Meta. Hace falta una cuenta de Meta Business, un número que no
            esté en la app normal de WhatsApp y configurar el webhook <code>/api/whatsapp</code> de esta app.
          </p>
          <p>
            Responder a quien escribe primero suele ser gratis; los mensajes que inicia el negocio (recordatorios) tienen un costo
            por mensaje que cobra Meta. Mientras tanto, este simulador permite probar todo el menú.
          </p>
          <p>Identificador de este negocio para la conexión: <code className="break-all">{business.id}</code></p>
        </div>
      </details>
    </div>
  );
}
