import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createRequestIfAvailable: vi.fn(),
  getRequests: vi.fn(),
  notifyAdminsAboutBooking: vi.fn(),
}));

vi.mock("@/lib/sheets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sheets")>()),
  createRequestIfAvailable: mocks.createRequestIfAvailable,
  getRequests: mocks.getRequests,
}));

vi.mock("@/lib/telegram", () => ({
  notifyAdminsAboutBooking: mocks.notifyAdminsAboutBooking,
}));

import { createAuthToken, AUTH_COOKIE } from "@/lib/auth";
import { clearRateLimits } from "@/lib/rate-limit";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as listBookings, POST as createBooking } from "@/app/api/bookings/route";
import { PATCH as updateSettings } from "@/app/api/settings/route";

const validBooking = {
  date: "2099-07-14",
  time: "19:00",
  duration: 60,
  format: "quarter",
  sector: "A",
  name: "API QA",
  phone: "+77000000000",
  team: "QA",
  source: "Test",
};

function jsonRequest(url: string, body: unknown, cookie?: string) {
  const headers = new Headers({ "Content-Type": "application/json", "x-forwarded-for": "127.0.0.7" });
  if (cookie) headers.set("Cookie", cookie);
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("API authorization and validation", () => {
  beforeEach(() => {
    process.env.ADMIN_LOGIN = "qa-admin";
    process.env.ADMIN_PASSWORD = "qa-password";
    process.env.AUTH_SECRET = "s".repeat(32);
    delete process.env.GOOGLE_APPS_SCRIPT_URL;
    delete process.env.GOOGLE_APPS_SCRIPT_SECRET;
    clearRateLimits();
    mocks.getRequests.mockReset().mockResolvedValue([]);
    mocks.notifyAdminsAboutBooking.mockReset().mockResolvedValue(undefined);
    mocks.createRequestIfAvailable.mockReset().mockImplementation(async (input, initial) => ({
      ...input,
      ...initial,
      id: "REQ-API-QA",
      createdAt: new Date().toISOString(),
      status: initial.status || "new",
    }));
  });

  it("returns 400 for malformed login JSON", async () => {
    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.8" },
      body: "{",
    });
    expect((await login(request)).status).toBe(400);
  });

  it("issues an HttpOnly admin cookie for valid credentials", async () => {
    const response = await login(jsonRequest("http://localhost/api/auth/login", {
      login: "qa-admin",
      password: "qa-password",
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${AUTH_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("protects the bookings list and settings mutation", async () => {
    expect((await listBookings(new NextRequest("http://localhost/api/bookings"))).status).toBe(401);
    expect((await updateSettings(jsonRequest("http://localhost/api/settings", {
      prices: { quarter: 1, half: 1, full: 1 },
    }))).status).toBe(401);
  });

  it("rejects malformed bookings before persistence", async () => {
    const response = await createBooking(jsonRequest("http://localhost/api/bookings", {
      ...validBooking,
      time: "19:15",
    }));
    expect(response.status).toBe(400);
    expect(mocks.createRequestIfAvailable).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied price", async () => {
    const response = await createBooking(jsonRequest("http://localhost/api/bookings", {
      ...validBooking,
      salePrice: 1,
      price: 1,
    }));
    expect(response.status).toBe(201);
    expect(mocks.createRequestIfAvailable.mock.calls[0][0]).toMatchObject({
      listPrice: 10000,
      salePrice: 10000,
      price: 10000,
    });
  });

  it("creates the requested admin status atomically", async () => {
    const token = createAuthToken("qa-admin");
    const response = await createBooking(jsonRequest(
      "http://localhost/api/bookings",
      { ...validBooking, status: "confirmed", salePrice: 9000 },
      `${AUTH_COOKIE}=${token}`,
    ));
    expect(response.status).toBe(201);
    expect(mocks.createRequestIfAvailable.mock.calls[0][1]).toEqual({ status: "confirmed" });
    expect(mocks.createRequestIfAvailable.mock.calls[0][0].salePrice).toBe(9000);
  });
});
