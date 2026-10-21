import { describe, expect, it } from "vitest";
import { fechaHubspotGuardada, resolverFechaDisposicion } from "../src/vale/disposicion";

const hubspot = "2026-10-21T15:00:00.000Z";
const paydesk = "2026-10-23T18:30:00.000Z";

describe("resolverFechaDisposicion", () => {
  it("con origen Paydesk ignora la etapa de HubSpot", () => {
    expect(resolverFechaDisposicion("paydesk", { paydesk, hubspot })).toBe(paydesk);
    expect(resolverFechaDisposicion("paydesk", { paydesk: null, hubspot })).toBeNull();
  });

  it("con origen HubSpot usa la fecha de la etapa", () => {
    expect(resolverFechaDisposicion("hubspot", { paydesk, hubspot })).toBe(hubspot);
    expect(resolverFechaDisposicion("hubspot", { paydesk, hubspot: null })).toBeNull();
  });
});

describe("fechaHubspotGuardada", () => {
  it("usa la fecha cruda de HubSpot cuando el deal ya la guarda", () => {
    expect(
      fechaHubspotGuardada({ disposicionHubspotFecha: null, disposicionCreditoFecha: paydesk }),
    ).toBeNull();
    expect(
      fechaHubspotGuardada({ disposicionHubspotFecha: hubspot, disposicionCreditoFecha: paydesk }),
    ).toBe(hubspot);
  });

  it("en un deal de antes del cambio, la única fecha que había era la de HubSpot", () => {
    expect(fechaHubspotGuardada({ disposicionCreditoFecha: hubspot })).toBe(hubspot);
    expect(fechaHubspotGuardada({ disposicionCreditoFecha: null })).toBeNull();
  });
});
