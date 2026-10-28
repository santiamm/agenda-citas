import type { Metadata } from "next";
import { formatDateLong, todayIn, whatsappLink, zonedToUtc } from "@/lib/format";
import { getOwnerBusiness } from "@/lib/owner";
import type { WaitlistItem } from "@/lib/types";
import { setWaitlistStatusAction } from "../../more-actions";

export const metadata: Metadata = { title: "Lista de espera" };

const LABEL = { waiting: "Esperando", contacted: "Ya le escribí", booked: "Ya reservó", cancelled: "Descartado" };

export default async function WaitlistPage({ params }: PageProps<"/panel/[slug]/espera">) {
  const { slug } = await params;
  const { supabase, business } = await getOwnerBusiness(slug);
  const today = todayIn(business.timezone);
  const { data } = await supabase
    .from("waitlist")
    .select("*, services(name)")
    .eq("business_id", business.id)
    .gte("desired_date", today)
    .order("desired_date")
    .order("created_at")
    .returns<WaitlistItem[]>();
  const items = data ?? [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agenda-citas-eight.vercel.app";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Lista de espera</h1>
        <p className="text-sm text-muted">
          Clientes que querían un día sin horas libres. Cuando alguien cancele, escríbeles. Se borran solas una semana después de la fecha.
        </p>
      </div>
      {items.length === 0 && <p className="card p-6 text-center text-muted">Nadie en lista de espera.</p>}
      <ul className="space-y-2">
        {items.map((w) => (
          <li key={w.id} className={`card p-4 ${w.status === "waiting" ? "" : "opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{w.customer_name}</p>
                <p className="text-sm text-muted">
                  {w.services?.name} · {formatDateLong(zonedToUtc(w.desired_date, "12:00", business.timezone), business.timezone)}
                </p>
              </div>
              <span className="rounded-full bg-paper px-2.5 py-1 text-xs">{LABEL[w.status]}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className="btn-primary min-h-9 px-3 text-sm"
                target="_blank"
                rel="noreferrer"
                href={whatsappLink(
                  w.customer_phone,
                  `Hola ${w.customer_name.split(" ")[0]}, se liberó una hora en ${business.name} para ${w.services?.name}. Resérvala aquí: ${appUrl}/b/${slug}`,
                )}
              >
                Escribirle
              </a>
              {(["contacted", "booked", "cancelled", "delete"] as const).map((s) => (
                <form key={s} action={setWaitlistStatusAction}>
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="status" value={s} />
                  <button className={`${s === "delete" ? "btn-danger" : "btn-ghost"} min-h-9 px-3 text-sm`}>
                    {s === "delete" ? "Borrar" : LABEL[s]}
                  </button>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
