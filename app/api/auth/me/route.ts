import { connection } from "next/server";
import { currentUser } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { json } from "@/lib/api";

/** Who is signed in, and whether the shared database is available at all. */
export async function GET(request: Request) {
  await connection();
  if (!hasDatabase()) return json({ user: null, database: false });
  try {
    return json({ user: await currentUser(request), database: true });
  } catch {
    return json({ user: null, database: false });
  }
}
