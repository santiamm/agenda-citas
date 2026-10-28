"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Escucha cambios en las citas del negocio: refresca la pantalla y avisa con un sonido. */
export function LiveUpdates({ businessId }: { businessId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`citas-${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${businessId}` },
        (change) => {
          const row = change.new as { customer_name?: string; status?: string; source?: string };
          if (change.eventType === "INSERT" && row.source !== "owner") {
            setToast(`Nueva cita: ${row.customer_name}`);
            beep();
          } else if (change.eventType === "UPDATE" && row.status === "cancelled") {
            setToast(`Se canceló la cita de ${row.customer_name}`);
          }
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "waitlist", filter: `business_id=eq.${businessId}` },
        (change) => {
          setToast(`${(change.new as { customer_name: string }).customer_name} se anotó en la lista de espera`);
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, businessId, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div role="status" className="fixed inset-x-4 top-3 z-20 mx-auto max-w-md rounded-xl bg-ink px-4 py-3 text-white shadow-lg">
      🔔 {toast}
    </div>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    // sin audio: solo el aviso visual
  }
}
