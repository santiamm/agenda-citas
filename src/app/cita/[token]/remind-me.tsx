"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { pushSupport, subscribePush } from "@/lib/push-client";

const noop = () => () => {};

/** El cliente pide que su celular le recuerde la cita la tarde anterior. */
export function RemindMe({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const support = useSyncExternalStore(noop, pushSupport, () => "loading");
  const [status, setStatus] = useState<{ ok?: boolean; text: string } | null>(null);

  if (support === "loading" || support === "no") return null;
  if (status?.ok) return <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm">✓ {status.text}</p>;
  if (support === "ios-browser")
    return (
      <p className="rounded-xl bg-paper px-3 py-2 text-sm text-muted">
        ¿Quieres un recordatorio? En iPhone agrega esta página a tu inicio (Compartir → «Agregar a inicio») y ábrela desde
        ahí. O usa el botón de calendario.
      </p>
    );
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-ghost w-full"
        onClick={async () => {
          setStatus({ text: "Activando…" });
          const sub = await subscribePush();
          if ("error" in sub) return setStatus({ text: sub.error });
          const { error } = await supabase.rpc("save_booking_push", {
            p_token: token,
            p_endpoint: sub.endpoint,
            p_p256dh: sub.p256dh,
            p_auth: sub.auth,
          });
          setStatus(
            error
              ? { text: "No se pudo activar. Intenta de nuevo." }
              : { ok: true, text: "Listo: la tarde anterior te llegará un recordatorio a este celular." },
          );
        }}
      >
        🔔 Recuérdamelo un día antes
      </button>
      {status && !status.ok && <p className="text-sm">{status.text}</p>}
    </div>
  );
}
