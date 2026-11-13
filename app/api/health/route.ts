import { connection } from "next/server";
import { envStatus } from "@/lib/env";

/** Deploy check: is the app up, and which keys are configured (never their values). */
export async function GET() {
  // Run at request time, not at build time, so it reflects the deployed env.
  await connection();
  const env = envStatus();
  return Response.json({
    app: "kasauti",
    status: "ok",
    ready: Object.values(env).every(Boolean),
    env,
    time: new Date().toISOString(),
  });
}
