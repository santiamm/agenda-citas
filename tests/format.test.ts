import { describe, expect, it } from "vitest";
import { addDays, dayRange, formatTime, friendlyError, slugify, whatsappLink, zonedToUtc } from "@/lib/format";

describe("utilidades", () => {
  it("convierte hora de Bogotá a UTC y arma el rango del día", () => {
    expect(zonedToUtc("2026-11-02", "09:00", "America/Bogota").toISOString()).toBe("2026-11-02T14:00:00.000Z");
    expect(dayRange("2026-11-02", "America/Bogota")).toEqual(["2026-11-02T05:00:00.000Z", "2026-11-03T05:00:00.000Z"]);
    expect(formatTime("2026-11-02T19:30:00Z", "America/Bogota")).toBe("2:30 p. m.");
  });

  it("también funciona con zonas con horario de verano", () => {
    expect(zonedToUtc("2026-07-01", "10:00", "America/New_York").toISOString()).toBe("2026-07-01T14:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "10:00", "America/New_York").toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });

  it("suma días cruzando meses", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("genera enlaces limpios", () => {
    expect(slugify("Barbería Ñandú & Café")).toBe("barberia-nandu-cafe");
    expect(slugify("  --Hola--  ")).toBe("hola");
  });

  it("arma el enlace de WhatsApp con +57 para celulares colombianos", () => {
    expect(whatsappLink("300 123 4567")).toBe("https://wa.me/573001234567");
    expect(whatsappLink("+1 555 123 4567", "hola")).toBe("https://wa.me/15551234567?text=hola");
  });

  it("traduce los errores de la base de datos", () => {
    expect(friendlyError('P0001: SLOT_TAKEN')).toMatch(/acaba de tomar/);
    expect(friendlyError('violates check constraint "businesses_slug_not_reserved"')).toMatch(/reservado/);
    expect(friendlyError(undefined)).toMatch(/Algo salió mal/);
  });
});
