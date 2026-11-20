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
    // The app needs only the NVIDIA key today. The database keys are reported but not required: there is no database yet.
    ready: env.nvidia,
    notes: { database: "not used yet; rules, proof and history are kept in the browser" },
    env,
    time: new Date().toISOString(),
  });
}
