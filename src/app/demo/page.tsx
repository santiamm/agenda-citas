import type { Metadata } from "next";
import Link from "next/link";
import { AgendaView } from "@/components/agenda-view";
import { Logo } from "@/components/logo";
import { getPublicBusiness } from "@/lib/data";
import { dayRange, todayIn } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AgendaItem } from "@/lib/types";

export const metadata: Metadata = { title: "Panel de ejemplo" };

const DEMO = "barberia-demo";

export default async function DemoPanel({ searchParams }: PageProps<"/demo">) {
  const { d } = await searchParams;
  const data = await getPublicBusiness(DEMO);
  const tz = data?.business.timezone ?? "America/Bogota";
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIn(tz);
  const [from, to] = dayRange(date, tz);
  const supabase = await createClient();
  const { data: items } = await supabase.rpc("get_demo_appointments", { p_slug: DEMO, p_from: from, p_to: to });

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <Link href="/entrar?modo=registro" className="btn-primary min-h-9 px-3 text-sm">
            Crear el mío
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Así ve su agenda el dueño de <strong>{data?.business.name ?? "la barbería demo"}</strong>. Los clientes son
          ficticios y los teléfonos están ocultos. Si reservas en{" "}
          <Link href={`/b/${DEMO}`} className="underline">
            su página
          </Link>
          , tu cita aparece aquí.
        </p>
        <AgendaView
          items={(items ?? []) as AgendaItem[]}
          date={date}
          tz={tz}
          basePath="/demo"
          slug={DEMO}
          businessName={data?.business.name ?? ""}
          readOnly
        />
      </main>
    </div>
  );
}
