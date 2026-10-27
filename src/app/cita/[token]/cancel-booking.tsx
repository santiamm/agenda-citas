"use client";

import { useState, useTransition } from "react";
import { cancelBookingAction } from "./actions";

export function CancelBooking({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" className="btn-danger w-full" onClick={() => setConfirming(true)}>
        Cancelar cita
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="font-medium text-red-900">¿Seguro que quieres cancelar?</p>
      <p className="text-sm text-red-900/80">La hora quedará libre para otra persona.</p>
      {error && <p className="mt-2 text-sm text-red-800">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={() => setConfirming(false)} disabled={pending}>
          No, mantener
        </button>
        <button
          type="button"
          className="btn flex-1 bg-red-700 text-white"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await cancelBookingAction(token);
              if (res?.error) setError(res.error);
            })
          }
        >
          {pending ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
    </div>
  );
}
