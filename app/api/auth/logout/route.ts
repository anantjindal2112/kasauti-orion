import { clearedCookie, sameOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  const secure = new URL(request.url).protocol === "https:";
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedCookie(secure), "Cache-Control": "no-store" } });
}
