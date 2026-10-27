"use client";

import { useState } from "react";

/** Guarda el enlace de la cita: compartir (celular) o copiar (computador). */
export function ShareBooking() {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href.split("?")[0];
    if (navigator.share) {
      await navigator.share({ title: "Mi cita", url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button type="button" className="btn-primary w-full" onClick={share}>
      {copied ? "Enlace copiado" : "Guardar enlace de mi cita"}
    </button>
  );
}
