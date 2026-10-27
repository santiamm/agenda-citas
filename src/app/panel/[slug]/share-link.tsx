"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** Botones para compartir el enlace público del negocio. */
export function ShareLink({ slug, name }: { slug: string; name: string }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin}/b/${slug}`;

  const text = `Reserva tu cita en ${name} aquí: ${url}`;
  return (
    <div className="space-y-2">
      <p className="break-all rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm">{url}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost flex-1 text-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>
        <a
          className="btn-primary flex-1 text-sm"
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
        >
          Compartir por WhatsApp
        </a>
      </div>
    </div>
  );
}
