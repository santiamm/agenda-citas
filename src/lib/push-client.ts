// Suscripción a notificaciones del navegador (lado del cliente), compartida por el dueño y los clientes.

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "ask" | "granted" | "denied" | "ios-browser" (iPhone sin instalar) | "no" (no soportado). */
export function pushSupport(): string {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return /iPhone|iPad/.test(navigator.userAgent) ? "ios-browser" : "no";
  }
  return Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "ask";
}

/** Pide permiso y devuelve la suscripción (endpoint y llaves) o un mensaje de error. */
export async function subscribePush(): Promise<{ endpoint: string; p256dh: string; auth: string } | { error: string }> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { error: "No diste permiso. Puedes activarlo en los ajustes del navegador." };
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { error: "El navegador no entregó la suscripción." };
    return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
  } catch {
    return { error: "Este navegador no permitió las notificaciones." };
  }
}
