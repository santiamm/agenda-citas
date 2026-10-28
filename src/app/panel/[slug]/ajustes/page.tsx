import type { Metadata } from "next";
import Link from "next/link";
import { getOwnerBusiness } from "@/lib/owner";
import { signOutAction } from "../../actions";
import { ShareLink } from "../share-link";
import { SettingsForm } from "./settings-form";
import { PushToggle } from "./push-toggle";
import { ActionForm } from "@/components/action-form";
import { todayIn } from "@/lib/format";
import { purgePastAction, saveNotifySettingsAction } from "../../more-actions";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage({ params }: PageProps<"/panel/[slug]/ajustes">) {
  const { slug } = await params;
  const { business, user } = await getOwnerBusiness(slug);
  const emailReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Tu enlace de reservas</h1>
        <ShareLink slug={business.slug} name={business.name} />
        <p className="text-sm text-muted">
          Ponlo en la bio de Instagram, en tu estado de WhatsApp o imprímelo en un letrero.
        </p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Avisos de citas nuevas</h2>
        <p className="text-sm text-muted">
          Te avisamos cuando alguien reserva, cancela o se anota en la lista de espera. Actívalo en cada celular donde quieras
          recibirlos.
        </p>
        <PushToggle />
        <ActionForm
          action={saveNotifySettingsAction}
          submit="Guardar preferencias"
          buttonClass="btn-ghost w-full"
          hidden={{ slug, id: business.id }}
        >
          <label className="flex items-center gap-2">
            <input type="checkbox" name="notify_push" defaultChecked={business.notify_push} className="h-5 w-5 accent-brand" />
            Notificaciones en el celular
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="notify_email" defaultChecked={business.notify_email} className="h-5 w-5 accent-brand" />
            Correo a {user.email}
          </label>
          {!emailReady && <p className="text-xs text-muted">El envío de correos aún no está configurado en el servidor.</p>}
          <label className="label mt-2" htmlFor="retention_days">
            Borrar solas las citas pasadas después de
          </label>
          <select id="retention_days" name="retention_days" defaultValue={business.retention_days ?? 0} className="input">
            <option value={0}>Nunca (guardar historial)</option>
            <option value={30}>30 días</option>
            <option value={90}>3 meses</option>
            <option value={180}>6 meses</option>
            <option value={365}>1 año</option>
          </select>
          <p className="text-xs text-muted">Lo que se borra deja de contar en el historial del cliente y en los reportes.</p>
        </ActionForm>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Borrar citas pasadas ahora</h2>
        <ActionForm
          action={purgePastAction}
          submit="Borrar citas anteriores a esa fecha"
          buttonClass="btn-danger w-full"
          hidden={{ slug, business_id: business.id, timezone: business.timezone }}
        >
          <input type="date" name="before" defaultValue={todayIn(business.timezone)} max={todayIn(business.timezone)} className="input" aria-label="Fecha límite" />
          <p className="text-xs text-muted">No se puede deshacer. Las citas de hoy en adelante no se tocan.</p>
        </ActionForm>
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
