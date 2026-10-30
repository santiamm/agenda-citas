// Bot de menú por números (WhatsApp o simulador). No sabe nada de WhatsApp ni de Supabase:
// recibe el estado de la conversación, el texto del cliente y unas funciones para consultar datos,
// y devuelve el nuevo estado y los mensajes a enviar. Así se puede probar solo.

import { addDays, dayChip, formatDateLong, formatDuration, formatMoney, formatTime, todayIn, weekdayOf } from "@/lib/format";

export type BotState = {
  step: "menu" | "service" | "resource" | "day" | "time" | "name" | "confirm" | "cancel";
  serviceId?: string;
  resourceId?: string | null;
  date?: string;
  startsAt?: string;
  name?: string;
  options?: string[]; // qué significa cada número de la última lista
};

export type BotBusiness = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  address: string | null;
  resource_label: string;
  max_days_ahead: number;
  category?: string;
};

export type BotDeps = {
  business: BotBusiness;
  appUrl: string;
  services: { id: string; name: string; duration_minutes: number; price: number }[];
  resources: { id: string; name: string }[];
  resourceServices: { resource_id: string; service_id: string }[];
  openWeekdays: number[];
  hoursText: string;
  slots: (serviceId: string, date: string, resourceId: string | null) => Promise<{ starts_at: string }[]>;
  book: (b: { serviceId: string; startsAt: string; name: string; resourceId: string | null }) => Promise<
    { token: string; resourceName: string } | { error: string }
  >;
  bookings: () => Promise<{ cancel_token: string; starts_at: string; service_name: string; resource_name: string }[]>;
  cancel: (token: string) => Promise<{ error?: string }>;
  membership: () => Promise<{ plan_name: string; is_paid: boolean; paid_until: string | null; visits_used: number; visits_limit: number | null }[]>;
  savedName: string | null;
};

const MAX_TIMES = 12;
const RESET = /^(0|hola|menu|menú|inicio|buenas|buenos días|buenas tardes|buenas noches|hi)$/i;

const numbered = (items: string[]) => items.map((t, i) => `${i + 1}. ${t}`).join("\n");

function menu(d: BotDeps): string {
  return [
    `¡Hola! 👋 Soy el asistente de *${d.business.name}*. Responde con un número:`,
    "",
    "1. Reservar una cita",
    "2. Ver mis citas",
    "3. Cancelar una cita",
    "4. Horarios y dirección",
    "5. Mi mensualidad",
    "6. Hablar con una persona",
  ].join("\n");
}

const footer = "\n\n0. Volver al menú";

export async function handleMessage(state: BotState | null, text: string, d: BotDeps): Promise<{ state: BotState; replies: string[] }> {
  const input = text.trim();
  const tz = d.business.timezone;
  const pick = (s: BotState) => {
    const n = Number(input);
    return Number.isInteger(n) && n >= 1 && s.options && n <= s.options.length ? s.options[n - 1] : null;
  };

  if (!state || RESET.test(input)) return { state: { step: "menu" }, replies: [menu(d)] };

  switch (state.step) {
    case "menu": {
      if (input === "1") return askService(d);
      if (input === "2") {
        const list = await d.bookings();
        if (!list.length) return { state, replies: [`No tienes citas próximas.\n\n1. Reservar una${footer}`] };
        return {
          state,
          replies: [
            "Tus próximas citas:\n\n" +
              list.map((b) => `• ${formatDateLong(b.starts_at, tz)}, ${formatTime(b.starts_at, tz)} – ${b.service_name} con ${b.resource_name}`).join("\n") +
              footer,
          ],
        };
      }
      if (input === "3") {
        const list = await d.bookings();
        if (!list.length) return { state, replies: [`No tienes citas para cancelar.${footer}`] };
        return {
          state: { step: "cancel", options: list.map((b) => b.cancel_token) },
          replies: [
            "¿Cuál quieres cancelar?\n\n" +
              numbered(list.map((b) => `${formatDateLong(b.starts_at, tz)}, ${formatTime(b.starts_at, tz)} – ${b.service_name}`)) +
              footer,
          ],
        };
      }
      if (input === "4")
        return {
          state,
          replies: [`🕒 ${d.hoursText}${d.business.address ? `\n📍 ${d.business.address}` : ""}\n\nReserva también aquí: ${d.appUrl}/b/${d.business.slug}${footer}`],
        };
      if (input === "5") {
        const m = await d.membership();
        if (!m.length) return { state, replies: [`No tienes una mensualidad con nosotros. Pregunta por los planes escribiendo 6.${footer}`] };
        return {
          state,
          replies: [
            m
              .map(
                (x) =>
                  `💳 *${x.plan_name}*\n${x.is_paid ? `Al día hasta el ${x.paid_until}` : "Pendiente de pago"}\nVisitas este mes: ${x.visits_used} de ${x.visits_limit ?? "ilimitadas"}`,
              )
              .join("\n\n") + footer,
          ],
        };
      }
      if (input === "6")
        return { state, replies: [`Listo, le avisamos a ${d.business.name}. Te responderán por este chat apenas puedan. 🙌${footer}`] };
      return { state, replies: [`No entendí 🙈. Responde solo con el número de la opción.\n\n${menu(d)}`] };
    }

    case "service": {
      const id = pick(state);
      if (!id) return { state, replies: ["Responde con el número del servicio." + footer] };
      const doers = whoDoes(d, id);
      // En restaurantes no se elige mesa: se asigna la que corresponde al tamaño del grupo.
      if (doers.length > 1 && d.business.category !== "restaurante") {
        return {
          state: { step: "resource", serviceId: id, options: ["any", ...doers.map((r) => r.id)] },
          replies: [`¿Con quién? (${d.business.resource_label.toLowerCase()})\n\n` + numbered(["Cualquiera", ...doers.map((r) => r.name)]) + footer],
        };
      }
      return askDay(d, id, null);
    }

    case "resource": {
      const id = pick(state);
      if (!id) return { state, replies: ["Responde con un número de la lista." + footer] };
      return askDay(d, state.serviceId!, id === "any" ? null : id);
    }

    case "day": {
      const date = pick(state);
      if (!date) return { state, replies: ["Responde con el número del día." + footer] };
      const slots = await d.slots(state.serviceId!, date, state.resourceId ?? null);
      if (!slots.length) return { state, replies: ["Ese día ya no tiene horas libres. Elige otro número de la lista." + footer] };
      const times = slots.slice(0, MAX_TIMES).map((s) => s.starts_at);
      return {
        state: { ...state, step: "time", date, options: times },
        replies: [
          `Horas libres el ${formatDateLong(times[0], tz).toLowerCase()}:\n\n` +
            numbered(times.map((t) => formatTime(t, tz))) +
            (slots.length > MAX_TIMES ? `\n\n(Hay más horas en ${d.appUrl}/b/${d.business.slug})` : "") +
            footer,
        ],
      };
    }

    case "time": {
      const at = pick(state);
      if (!at) return { state, replies: ["Responde con el número de la hora." + footer] };
      if (d.savedName) return confirm(d, { ...state, startsAt: at, name: d.savedName });
      return { state: { ...state, step: "name", startsAt: at, options: [] }, replies: ["¿A nombre de quién? Escribe tu nombre."] };
    }

    case "name": {
      if (input.length < 2 || input.length > 80) return { state, replies: ["Escribe tu nombre (mínimo 2 letras)."] };
      return confirm(d, { ...state, name: input });
    }

    case "confirm": {
      if (input === "2") return { state: { step: "menu" }, replies: ["Listo, no se reservó nada.\n\n" + menu(d)] };
      if (input !== "1") return { state, replies: ["Responde 1 para confirmar o 2 para cancelar."] };
      const res = await d.book({ serviceId: state.serviceId!, startsAt: state.startsAt!, name: state.name!, resourceId: state.resourceId ?? null });
      if ("error" in res) {
        return { state: { step: "menu" }, replies: [`😕 ${res.error}\n\nEscribe 1 para intentar con otra hora.\n\n${menu(d)}`] };
      }
      return {
        state: { step: "menu" },
        replies: [
          `✅ ¡Cita reservada!\n${service(d, state.serviceId!).name} – ${formatDateLong(state.startsAt!, tz)}, ${formatTime(state.startsAt!, tz)} con ${res.resourceName}.\n\nVer o cancelar: ${d.appUrl}/cita/${res.token}${footer}`,
        ],
      };
    }

    case "cancel": {
      const token = pick(state);
      if (!token) return { state, replies: ["Responde con el número de la cita." + footer] };
      const r = await d.cancel(token);
      return { state: { step: "menu" }, replies: [r.error ? `😕 ${r.error}${footer}` : `Cita cancelada. ¡Gracias por avisar!${footer}`] };
    }
  }
}

function service(d: BotDeps, id: string) {
  return d.services.find((s) => s.id === id)!;
}

function whoDoes(d: BotDeps, serviceId: string) {
  const ids = d.resourceServices.filter((rs) => rs.service_id === serviceId).map((rs) => rs.resource_id);
  return ids.length ? d.resources.filter((r) => ids.includes(r.id)) : d.resources;
}

function askService(d: BotDeps) {
  return {
    state: { step: "service" as const, options: d.services.map((s) => s.id) },
    replies: [
      "¿Qué servicio quieres?\n\n" +
        numbered(
          d.services.map(
            (s) => `${s.name} (${formatDuration(s.duration_minutes)}${s.price > 0 ? `, ${formatMoney(s.price, d.business.currency)}` : ""})`,
          ),
        ) +
        footer,
    ],
  };
}

function askDay(d: BotDeps, serviceId: string, resourceId: string | null) {
  const today = todayIn(d.business.timezone);
  const days: string[] = [];
  for (let i = 0; days.length < 7 && i <= d.business.max_days_ahead; i++) {
    const day = addDays(today, i);
    if (d.openWeekdays.includes(weekdayOf(day))) days.push(day);
  }
  return {
    state: { step: "day" as const, serviceId, resourceId, options: days },
    replies: [
      "¿Qué día?\n\n" +
        numbered(
          days.map((day) => {
            const c = dayChip(day, d.business.timezone);
            return `${c.top} ${c.bottom}`;
          }),
        ) +
        footer,
    ],
  };
}

function confirm(d: BotDeps, s: BotState) {
  const tz = d.business.timezone;
  const who = s.resourceId ? ` con ${d.resources.find((r) => r.id === s.resourceId)?.name}` : "";
  return {
    state: { ...s, step: "confirm" as const, options: [] },
    replies: [
      `Confirma tu cita:\n\n*${service(d, s.serviceId!).name}*\n${formatDateLong(s.startsAt!, tz)}, ${formatTime(s.startsAt!, tz)}${who}\nA nombre de: ${s.name}\n\n1. Sí, reservar\n2. No, cancelar`,
    ],
  };
}
