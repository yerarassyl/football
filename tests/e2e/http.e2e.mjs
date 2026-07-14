import assert from "node:assert/strict";

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";

async function check(name, action) {
  await action();
  process.stdout.write(`PASS ${name}\n`);
}

await check("public home and security headers", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") || "", /default-src 'self'/);
});

await check("admin page rejects anonymous access", async () => {
  const response = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
  if ([302, 303, 307, 308].includes(response.status)) {
    assert.match(response.headers.get("location") || "", /\/admin\/login/);
    return;
  }
  // In development Next can encode a server-component redirect in a streamed 200 response.
  const body = await response.text();
  assert.match(body, /NEXT_REDIRECT/);
  assert.match(body, /\/admin\/login/);
});

await check("unknown route returns 404", async () => {
  const response = await fetch(`${baseUrl}/qa-route-that-does-not-exist`);
  assert.equal(response.status, 404);
  assert.match(await response.text(), /Страница не найдена/);
});

await check("admin API rejects anonymous access", async () => {
  const response = await fetch(`${baseUrl}/api/bookings`);
  assert.equal(response.status, 401);
});

await check("availability rejects an invalid date", async () => {
  const response = await fetch(`${baseUrl}/api/availability?date=not-a-date`);
  assert.equal(response.status, 400);
});

await check("booking API rejects malformed input without persistence", async () => {
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.90" },
    body: JSON.stringify({
      date: "2099-07-14",
      time: "19:15",
      duration: 60,
      format: "quarter",
      sector: "A",
      name: "HTTP QA",
      phone: "+77000000000",
    }),
  });
  assert.equal(response.status, 400);
});
