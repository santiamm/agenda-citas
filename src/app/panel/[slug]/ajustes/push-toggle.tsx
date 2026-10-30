"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { pushSupport, subscribePush } from "@/lib/push-client";

const noop = () => () => {};

/** Activa las notificaciones de citas nuevas en este celular. */
export function PushToggle() {
  const supabase = useMemo(() => createClient(), []);
  const support = useSyncExternalStore(noop, pushSupport, () => "loading");
  const [status, setStatus] = useState<string | null>(null);

  async function enable() {
    setStatus("Activando…");
    const sub = await subscribePush();
    if ("error" in sub) return setStatus(sub.error);
    const { error } = await supabase.rpc("save_push_subscription", {
      p_endpoint: sub.endpoint,
      p_p256dh: sub.p256dh,
      p_auth: sub.auth,
      p_user_agent: navigator.userAgent,
    });
    setStatus(error ? "No se pudo guardar. Intenta de nuevo." : "✓ Listo: este celular recibirá avisos de citas nuevas y el resumen de cada tarde.");
  }

  if (support === "loading") return null;
  if (support === "ios-browser")
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        En iPhone primero instala la app: en Safari toca Compartir → «Agregar a inicio». Ábrela desde ese ícono y vuelve aquí.
      </p>
    );
  if (support === "no") return <p className="text-sm text-muted">Este navegador no soporta notificaciones.</p>;
  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary w-full" onClick={enable}>
        {support === "granted" ? "Volver a activar en este celular" : "🔔 Activar avisos en este celular"}
      </button>
      {support === "denied" && !status && (
        <p className="text-sm text-red-700">Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para este sitio.</p>
      )}
      {status && <p className="text-sm">{status}</p>}
    </div>
  );
}
