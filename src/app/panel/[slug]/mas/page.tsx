import type { Metadata } from "next";
import Link from "next/link";
import { getOwnerBusiness } from "@/lib/owner";

export const metadata: Metadata = { title: "Más" };

const ITEMS = [
  { href: "/mensualidades", icon: "💳", title: "Mensualidades", text: "Planes mensuales, quién está al día y pagos." },
  { href: "/espera", icon: "⏳", title: "Lista de espera", text: "Clientes que quieren un día sin horas libres." },
  { href: "/reportes", icon: "📊", title: "Reportes", text: "Citas, ingresos, barberos y clientes frecuentes." },
  { href: "/bot", icon: "🤖", title: "Bot de WhatsApp (prueba)", text: "Simula el menú automático con números." },
  { href: "/qr", icon: "🔳", title: "Cartel con QR", text: "Para imprimir y pegar en el local." },
  { href: "/ajustes", icon: "⚙️", title: "Ajustes y avisos", text: "Datos del negocio, notificaciones y limpieza." },
];

export default async function MorePage({ params }: PageProps<"/panel/[slug]/mas">) {
  const { slug } = await params;
  await getOwnerBusiness(slug);
  return (
    <div className="space-y-2">
      <h1 className="mb-3 text-xl font-semibold">Más</h1>
      {ITEMS.map((i) => (
        <Link key={i.href} href={`/panel/${slug}${i.href}`} className="card flex items-center gap-4 p-4 hover:border-muted">
          <span className="text-2xl" aria-hidden>
            {i.icon}
          </span>
          <span>
            <span className="block font-medium">{i.title}</span>
            <span className="text-sm text-muted">{i.text}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
