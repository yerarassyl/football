import crypto from "crypto";

export const AUTH_COOKIE = "football_admin";

const secret = () => process.env.AUTH_SECRET || "local-development-secret";

export function createAuthToken(login: string) {
  const payload = `${login}:${Date.now() + 1000 * 60 * 60 * 12}`;
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function verifyAuthToken(token?: string) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [login, expires, signature] = decoded.split(":");
    const payload = `${login}:${expires}`;
    const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
    return (
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) &&
      Number(expires) > Date.now()
    );
  } catch {
    return false;
  }
}
