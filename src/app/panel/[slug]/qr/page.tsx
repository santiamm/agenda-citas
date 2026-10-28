import type { Metadata } from "next";
import QRCode from "qrcode";
import { getOwnerBusiness } from "@/lib/owner";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Cartel QR" };

export default async function QrPage({ params }: PageProps<"/panel/[slug]/qr">) {
  const { slug } = await params;
  const { business } = await getOwnerBusiness(slug);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agenda-citas-eight.vercel.app";
  const url = `${appUrl}/b/${business.slug}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#1c1917", light: "#ffffff" } });

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-xl font-semibold">Cartel con QR</h1>
        <p className="text-sm text-muted">Imprímelo o guárdalo como PDF y pégalo en el espejo, la caja o la puerta.</p>
        <PrintButton />
      </div>
      <div className="card mx-auto max-w-sm p-8 text-center print:border-0">
        <p className="text-sm uppercase tracking-widest text-muted">Reserva tu cita</p>
        <h2 className="mt-1 text-2xl font-semibold">{business.name}</h2>
        <div className="mx-auto mt-5 w-56" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 font-medium">Escanea con la cámara del celular</p>
        <p className="mt-1 break-all text-xs text-muted">{url}</p>
      </div>
    </div>
  );
}
