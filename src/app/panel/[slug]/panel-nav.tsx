"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Agenda", icon: "📅" },
  { href: "/servicios", label: "Servicios", icon: "✂️" },
  { href: "/horario", label: "Horario", icon: "🕒" },
  { href: "/ajustes", label: "Ajustes", icon: "⚙️" },
];

export function PanelNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/panel/${slug}`;
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {TABS.map((t) => {
          const href = base + t.href;
          const active = t.href ? path.startsWith(href) : path === base;
          return (
            <li key={t.label}>
              <Link
                href={href}
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
