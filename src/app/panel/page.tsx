import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getUser } from "@/lib/supabase/server";
import { CATEGORIES, type Business } from "@/lib/types";
import { signOutAction } from "./actions";
import { CreateBusinessForm } from "./create-business-form";

export const metadata: Metadata = { title: "Mis negocios" };

export default async function PanelHome({ searchParams }: PageProps<"/panel">) {
  const { nuevo } = await searchParams;
  const { supabase, user } = await getUser();
  if (!user) redirect("/entrar");
  const { data } = await supabase.from("businesses").select("*").eq("owner_id", user.id).order("created_at");
  const businesses = (data ?? []) as Business[];

  if (businesses.length === 1 && !nuevo) redirect(`/panel/${businesses[0].slug}`);

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <div className="flex items-center justify-between">
        <Logo href="/panel" />
        <form action={signOutAction}>
          <button className="text-sm text-muted underline underline-offset-4">Salir</button>
        </form>
      </div>

      {businesses.length > 0 && (
        <section className="mt-8">
          <h1 className="text-2xl font-semibold">Mis negocios</h1>
          <ul className="mt-4 space-y-2">
            {businesses.map((b) => (
              <li key={b.id}>
                <Link href={`/panel/${b.slug}`} className="card flex items-center justify-between p-4 hover:border-muted">
                  <span>
                    <span className="block font-medium">{b.name}</span>
                    <span className="text-sm text-muted">/b/{b.slug}</span>
                  </span>
                  <span className="text-2xl">{CATEGORIES.find((c) => c.value === b.category)?.emoji}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">{businesses.length ? "Agregar otro negocio" : "Crea tu negocio"}</h2>
        <p className="mt-1 text-muted">
          Te dejamos servicios y un horario de ejemplo según el tipo de negocio. Luego los cambias como quieras.
        </p>
        <CreateBusinessForm />
      </section>
    </div>
  );
}
