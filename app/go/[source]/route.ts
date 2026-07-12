import { NextRequest, NextResponse } from "next/server";
import { normalizeReferralSource, referralDetail } from "@/lib/referrals";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ source: string }> },
) {
  const { source } = await context.params;
  const url = new URL("/", request.url);
  const campaign = request.nextUrl.searchParams.get("campaign") || request.nextUrl.searchParams.get("utm_campaign");
  const normalized = normalizeReferralSource(source);
  const detail = referralDetail(source, campaign);

  url.searchParams.set("source", normalized);
  if (detail) url.searchParams.set("source_detail", detail);

  const response = NextResponse.redirect(url);
  response.cookies.set("air_arena_source", normalized, {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });
  response.cookies.set("air_arena_source_detail", detail, {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });
  return response;
}
