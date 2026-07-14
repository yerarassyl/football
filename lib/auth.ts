import crypto from "crypto";

export const AUTH_COOKIE = "football_admin";

export type AuthConfig = {
  login: string;
  password: string;
  secret: string;
};

export function getAuthConfig(): AuthConfig | null {
  const login = process.env.ADMIN_LOGIN?.trim() || "";
  const password = process.env.ADMIN_PASSWORD || "";
  const secret = process.env.AUTH_SECRET || "";
  if (!login || !password || secret.length < 32) return null;
  return { login, password, secret };
}

export function createAuthToken(login: string) {
  const config = getAuthConfig();
  if (!config) throw new Error("Admin authentication is not configured");
  const payload = `${login}:${Date.now() + 1000 * 60 * 60 * 12}`;
  const signature = crypto.createHmac("sha256", config.secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function verifyAuthToken(token?: string) {
  const config = getAuthConfig();
  if (!token || !config) return false;
  try {
    const tokenBuffer = Buffer.from(token, "base64url");
    if (tokenBuffer.toString("base64url") !== token) return false;
    const decoded = tokenBuffer.toString();
    const [login, expires, signature] = decoded.split(":");
    if (!login || !expires || !signature || login !== config.login) return false;
    const payload = `${login}:${expires}`;
    const expected = crypto.createHmac("sha256", config.secret).update(payload).digest("hex");
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return (
      crypto.timingSafeEqual(actualBuffer, expectedBuffer) &&
      Number(expires) > Date.now()
    );
  } catch {
    return false;
  }
}
