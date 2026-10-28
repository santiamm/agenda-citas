"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

const noop = () => () => {};

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Activa las notificaciones de citas nuevas en este celular. */
export function PushToggle() {
  const supabase = useMemo(() => createClient(), []);
  const support = useSyncExternalStore(
    noop,
    () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // En iPhone solo funciona con la app instalada en la pantalla de inicio.
        return /iPhone|iPad/.test(navigator.userAgent) ? "ios-browser" : "no";
      }
      return Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "ask";
    },
    () => "loading",
  );
  const [status, setStatus] = useState<string | null>(null);

  async function enable() {
    setStatus("Activando…");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus("No diste permiso. Puedes activarlo en los ajustes del navegador.");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        }));
      const json = sub.toJSON();
      const { error } = await supabase.rpc("save_push_subscription", {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys?.p256dh,
        p_auth: json.keys?.auth,
        p_user_agent: navigator.userAgent,
      });
      setStatus(error ? "No se pudo guardar. Intenta de nuevo." : "✓ Listo: este celular recibirá avisos de citas nuevas.");
    } catch {
      setStatus("Este navegador no permitió las notificaciones.");
    }
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
