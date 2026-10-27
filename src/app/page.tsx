import Link from "next/link";
import { Logo } from "@/components/logo";
import { CATEGORIES } from "@/lib/types";

const STEPS = [
  { title: "Crea tu negocio", text: "Elige el tipo y te dejamos servicios y horario de ejemplo para ajustar." },
  { title: "Comparte tu enlace", text: "Por WhatsApp, Instagram o en un letrero. Tus clientes no instalan nada." },
  { title: "Recibe reservas", text: "Ellos eligen servicio y hora libre. Tú confirmas o cancelas desde el celular." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Logo />
        <Link href="/entrar" className="btn-ghost text-sm">
          Entrar
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="grid gap-10 py-10 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-16">
          <div>
            <p className="mb-3 inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
              Gratis para empezar · funciona en Android y iPhone
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Tus clientes reservan solos.
              <br />
              <span className="text-brand">Tú dejas de contestar «¿a qué hora hay?»</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Una agenda en línea para barberías, salones, restaurantes, spas y consultorios. Cada negocio tiene su
              enlace, sus servicios y sus horarios, y nunca se cruzan dos citas a la misma hora.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/entrar?modo=registro" className="btn-primary text-base">
                Crear mi negocio
              </Link>
              <Link href="/b/barberia-demo" className="btn-ghost text-base">
                Probar como cliente
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted">
              ¿Quieres ver el lado del dueño?{" "}
              <Link href="/demo" className="font-medium text-brand underline underline-offset-4">
                Mira el panel de ejemplo
              </Link>
              .
            </p>
          </div>

          <div className="card p-5 shadow-sm">
            <p className="text-sm text-muted">Así lo ve tu cliente</p>
            <p className="mt-1 text-lg font-semibold">Barbería La Esquina</p>
            <div className="mt-4 space-y-2">
              {[
                ["Corte clásico", "30 min", "$20.000"],
                ["Corte + barba", "45 min", "$30.000"],
              ].map(([n, d, p], i) => (
                <div
                  key={n}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 ${i === 0 ? "border-brand bg-brand-soft" : "border-line"}`}
                >
                  <span className="font-medium">{n}</span>
                  <span className="text-sm text-muted">
                    {d} · {p}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
              {["9:00", "9:30", "10:15", "11:00", "2:00", "2:30", "3:45", "4:30"].map((t, i) => (
                <span
                  key={t}
                  className={`rounded-lg border py-2 ${i === 2 ? "border-brand bg-brand text-brand-ink" : "border-line"}`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-12 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
                {i + 1}
              </span>
              <h2 className="mt-3 font-semibold">{s.title}</h2>
              <p className="mt-1 text-muted">{s.text}</p>
            </div>
          ))}
        </section>

        <section className="pb-16">
          <h2 className="text-xl font-semibold">Sirve para</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <span key={c.value} className="rounded-full border border-line bg-white px-3 py-1.5">
                {c.emoji} {c.label}
              </span>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        Proyecto de Jhoseph Mendez · hecho con ayuda de IA ·{" "}
        <a href="https://github.com/santiamm/agenda-citas" className="underline underline-offset-4">
          código
        </a>
      </footer>
    </div>
  );
}
