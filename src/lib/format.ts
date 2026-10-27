// Fechas, horas, dinero y mensajes. Todo se muestra en la zona horaria del negocio.

export const DEFAULT_TZ = "America/Bogota";

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** 'YYYY-MM-DD' de hoy (o de `at`) en la zona horaria dada. */
export function todayIn(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Minutos de diferencia entre la zona y UTC en ese instante (Bogotá = -300). */
function offsetMinutes(tz: string, at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")!.value; // "GMT-05:00" o "GMT"
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Instante UTC de una hora local ('YYYY-MM-DD', 'HH:MM') en la zona dada. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  return new Date(guess.getTime() - offsetMinutes(tz, guess) * 60_000);
}

/** [inicio, fin) del día local en UTC, para consultar citas de un día. */
export function dayRange(date: string, tz: string): [string, string] {
  return [zonedToUtc(date, "00:00", tz).toISOString(), zonedToUtc(addDays(date, 1), "00:00", tz).toISOString()];
}

export function formatTime(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .replace(/\s?a\.\s?m\./, " a. m.")
    .replace(/\s?p\.\s?m\./, " p. m.");
}

export function formatDateLong(iso: string | Date, tz: string): string {
  const s = new Intl.DateTimeFormat("es-CO", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(
    new Date(iso),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Etiqueta corta de un 'YYYY-MM-DD': "Hoy", "Mañana" o "Jue 30". */
export function dayChip(date: string, tz: string): { top: string; bottom: string } {
  const today = todayIn(tz);
  const d = new Date(`${date}T12:00:00Z`);
  const bottom = `${d.getUTCDate()} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getUTCMonth()]}`;
  if (date === today) return { top: "Hoy", bottom };
  if (date === addDays(today, 1)) return { top: "Mañana", bottom };
  return { top: WEEKDAYS_SHORT[d.getUTCDay()], bottom };
}

export function formatMoney(value: number, currency = "COP"): string {
  if (!value) return "";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Enlace de WhatsApp. Números de 10 dígitos se asumen de Colombia (+57). */
export function whatsappLink(phone: string, text?: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `57${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

const ERRORS: Record<string, string> = {
  INVALID_NAME: "Escribe tu nombre (mínimo 2 letras).",
  INVALID_PHONE: "Revisa el teléfono: debe tener entre 7 y 15 números.",
  INVALID_NOTES: "La nota es muy larga (máximo 500 caracteres).",
  BUSINESS_NOT_FOUND: "Este negocio ya no existe.",
  SERVICE_NOT_FOUND: "Ese servicio ya no está disponible.",
  TOO_MANY_BOOKINGS: "Ya tienes 3 citas pendientes con este negocio. Cancela una para pedir otra.",
  SLOT_UNAVAILABLE: "Esa hora ya no está disponible. Elige otra.",
  SLOT_TAKEN: "Alguien acaba de tomar esa hora. Elige otra.",
  NOT_FOUND: "No encontramos esa cita.",
  NOT_CANCELLABLE: "Esta cita ya no se puede cancelar.",
  ALREADY_STARTED: "La cita ya empezó; comunícate directamente con el negocio.",
  SLUG_TAKEN: "Ese enlace ya lo usa otro negocio. Prueba con otro.",
  NOT_AUTHENTICATED: "Tu sesión se cerró. Vuelve a entrar.",
  appointments_no_overlap: "Esa hora se cruza con otra cita activa del mismo recurso.",
  businesses_slug_not_reserved: "Ese enlace está reservado por la app. Prueba con otro.",
};

/** Traduce el mensaje de error de Supabase a algo que entienda una persona. */
export function friendlyError(message: string | undefined | null): string {
  if (!message) return "Algo salió mal. Intenta de nuevo.";
  for (const [code, text] of Object.entries(ERRORS)) if (message.includes(code)) return text;
  if (message.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (message.includes("Email not confirmed")) return "Primero confirma tu correo: revisa tu bandeja de entrada.";
  if (message.includes("User already registered")) return "Ese correo ya tiene cuenta. Entra con tu contraseña.";
  if (message.includes("Password should be")) return "La contraseña debe tener al menos 6 caracteres.";
  if (message.toLowerCase().includes("rate limit")) return "Demasiados intentos. Espera un momento e intenta otra vez.";
  if (message.includes("check constraint")) return "Algún dato no es válido. Revisa el formulario.";
  return "Algo salió mal. Intenta de nuevo.";
}
