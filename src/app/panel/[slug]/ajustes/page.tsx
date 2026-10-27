import type { Metadata } from "next";
import Link from "next/link";
import { getOwnerBusiness } from "@/lib/owner";
import { signOutAction } from "../../actions";
import { ShareLink } from "../share-link";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage({ params }: PageProps<"/panel/[slug]/ajustes">) {
  const { slug } = await params;
  const { business, user } = await getOwnerBusiness(slug);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Tu enlace de reservas</h1>
        <ShareLink slug={business.slug} name={business.name} />
        <p className="text-sm text-muted">
          Ponlo en la bio de Instagram, en tu estado de WhatsApp o imprímelo en un letrero.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Datos del negocio</h2>
        <SettingsForm business={business} />
      </section>

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Cuenta</h2>
        <p className="text-muted">Entraste como {user.email}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/panel/cuenta" className="btn-ghost">
            Cambiar contraseña
          </Link>
          <Link href="/panel?nuevo=1" className="btn-ghost">
            Mis negocios
          </Link>
          <form action={signOutAction}>
            <button className="btn-danger">Cerrar sesión</button>
          </form>
        </div>
      </section>
    </div>
  );
}
