import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthToken, getAuthConfig, verifyAuthToken } from "@/lib/auth";
import { clearRateLimits, consumeRateLimit } from "@/lib/rate-limit";

describe("admin authentication", () => {
  beforeEach(() => {
    process.env.ADMIN_LOGIN = "qa-admin";
    process.env.ADMIN_PASSWORD = "qa-password";
    process.env.AUTH_SECRET = "a".repeat(32);
  });

  afterEach(() => {
    delete process.env.ADMIN_LOGIN;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.AUTH_SECRET;
  });

  it("fails closed when credentials or a strong secret are missing", () => {
    delete process.env.AUTH_SECRET;
    expect(getAuthConfig()).toBeNull();
    expect(verifyAuthToken("anything")).toBe(false);
  });

  it("accepts a signed non-expired token and rejects tampering", () => {
    const token = createAuthToken("qa-admin");
    expect(verifyAuthToken(token)).toBe(true);
    expect(verifyAuthToken(`${token}x`)).toBe(false);
  });
});

describe("rate limiting", () => {
  beforeEach(clearRateLimits);

  it("blocks requests above the limit and permits them after reset", () => {
    expect(consumeRateLimit("test", 2, 1000, 100).allowed).toBe(true);
    expect(consumeRateLimit("test", 2, 1000, 101).allowed).toBe(true);
    expect(consumeRateLimit("test", 2, 1000, 102).allowed).toBe(false);
    expect(consumeRateLimit("test", 2, 1000, 1101).allowed).toBe(true);
  });
});
