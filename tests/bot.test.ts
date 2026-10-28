import { describe, expect, it } from "vitest";
import { handleMessage, type BotDeps, type BotState } from "@/lib/bot";
import { addDays, todayIn } from "@/lib/format";

const tomorrow = addDays(todayIn("America/Bogota"), 1);
const slotAt = new Date(`${tomorrow}T15:00:00Z`).toISOString(); // 10:00 a. m. Bogotá

function deps(over: Partial<BotDeps> = {}): BotDeps & { booked: unknown[] } {
  const booked: unknown[] = [];
  return {
    booked,
    business: {
      id: "b1",
      name: "Barbería Esparza",
      slug: "barberia-esparza",
      timezone: "America/Bogota",
      currency: "COP",
      address: "Calle 1",
      resource_label: "Barbero",
      max_days_ahead: 30,
    },
    appUrl: "https://app.test",
    services: [
      { id: "s1", name: "Corte", duration_minutes: 30, price: 20000 },
      { id: "s2", name: "Barba", duration_minutes: 20, price: 12000 },
    ],
    resources: [
      { id: "r1", name: "Esparza" },
      { id: "r2", name: "Andrés" },
    ],
    resourceServices: [{ resource_id: "r2", service_id: "s2" }], // la barba solo la hace Andrés
    openWeekdays: [0, 1, 2, 3, 4, 5, 6],
    hoursText: "Lun–Sáb 9:00–18:00",
    savedName: null,
    slots: async () => [{ starts_at: slotAt }],
    book: async (b) => {
      booked.push(b);
      return { token: "tok-1", resourceName: "Esparza" };
    },
    bookings: async () => [],
    cancel: async () => ({}),
    membership: async () => [],
    ...over,
  };
}

async function talk(d: BotDeps, messages: string[]) {
  let state: BotState | null = null;
  let last: string[] = [];
  for (const m of messages) {
    const r = await handleMessage(state, m, d);
    state = r.state;
    last = r.replies;
  }
  return { state: state!, last };
}

describe("bot de menú", () => {
  it("cualquier saludo muestra el menú con números", async () => {
    const { last } = await talk(deps(), ["hola"]);
    expect(last[0]).toContain("1. Reservar una cita");
    expect(last[0]).toContain("5. Mi mensualidad");
  });

  it("reserva completa: servicio, barbero, día, hora, nombre y confirmación", async () => {
    const d = deps();
    const { last, state } = await talk(d, ["hola", "1", "1", "2", "1", "1", "Juan Pérez", "1"]);
    expect(last[0]).toContain("Cita reservada");
    expect(last[0]).toContain("https://app.test/cita/tok-1");
    expect(state.step).toBe("menu");
    expect(d.booked).toEqual([{ serviceId: "s1", startsAt: slotAt, name: "Juan Pérez", resourceId: "r1" }]);
  });

  it("si solo una persona hace el servicio, no pregunta con quién", async () => {
    const { last, state } = await talk(deps(), ["hola", "1", "2"]);
    expect(state.step).toBe("day");
    expect(last[0]).toContain("¿Qué día?");
  });

  it("responde con ayuda si el número no existe y 0 vuelve al menú", async () => {
    const d = deps();
    const r1 = await talk(d, ["hola", "9"]);
    expect(r1.last[0]).toContain("No entendí");
    const r2 = await talk(d, ["hola", "1", "7"]);
    expect(r2.last[0]).toContain("número del servicio");
    const r3 = await talk(d, ["hola", "1", "0"]);
    expect(r3.state.step).toBe("menu");
  });

  it("si la hora ya se ocupó, lo dice y vuelve al menú", async () => {
    const d = deps({ book: async () => ({ error: "Alguien acaba de tomar esa hora. Elige otra." }) });
    const { last } = await talk(d, ["hola", "1", "1", "1", "1", "1", "Ana", "1"]);
    expect(last[0]).toContain("acaba de tomar");
  });

  it("muestra y cancela citas del mismo teléfono", async () => {
    const cancelled: string[] = [];
    const d = deps({
      bookings: async () => [{ cancel_token: "t9", starts_at: slotAt, service_name: "Corte", resource_name: "Esparza" }],
      cancel: async (t) => {
        cancelled.push(t);
        return {};
      },
    });
    expect((await talk(d, ["hola", "2"])).last[0]).toContain("Corte con Esparza");
    const r = await talk(d, ["hola", "3", "1"]);
    expect(r.last[0]).toContain("Cita cancelada");
    expect(cancelled).toEqual(["t9"]);
  });

  it("informa el estado de la mensualidad", async () => {
    const d = deps({
      membership: async () => [{ plan_name: "Plan 4 cortes", is_paid: true, paid_until: "2026-12-01", visits_used: 1, visits_limit: 4 }],
    });
    const { last } = await talk(d, ["hola", "5"]);
    expect(last[0]).toContain("Plan 4 cortes");
    expect(last[0]).toContain("1 de 4");
  });
});
