"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Agenda", icon: "📅" },
  { href: "/clientes", label: "Clientes", icon: "👥" },
  { href: "/servicios", label: "Servicios", icon: "✂️" },
  { href: "/horario", label: "Horario", icon: "🕒" },
  { href: "/mas", label: "Más", icon: "☰" },
];

// Secciones que viven dentro de "Más".
const MORE = ["/mas", "/mensualidades", "/espera", "/reportes", "/bot", "/qr", "/ajustes"];

export function PanelNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/panel/${slug}`;
  const isActive = (href: string) => {
    if (!href) return path === base || path === `${base}/nueva`;
    if (href === "/mas") return MORE.some((m) => path.startsWith(base + m));
    return path.startsWith(base + href);
  };
  return (
    <nav className="safe-bottom print:hidden fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <li key={t.label}>
              <Link
                href={base + t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pt-2 pb-1 text-xs ${active ? "font-semibold text-brand" : "text-muted"}`}
              >
                <span className="text-lg" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
