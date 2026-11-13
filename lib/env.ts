import { z } from "zod";

/**
 * Server-side environment. Validated lazily (on first use) so `next build`
 * works before keys are configured. Never import this from a client component.
 */
const serverEnvSchema = z.object({
  NVIDIA_API_KEY: z.string().min(1, "NVIDIA_API_KEY is missing"),
  NVIDIA_BASE_URL: z.url().default("https://integrate.api.nvidia.com/v1"),
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is missing"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

type RawEnv = Record<string, string | undefined>;

/** Treat empty strings as unset, so a blank line in .env.local counts as missing. */
function clean(raw: RawEnv): RawEnv {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
}

export function parseServerEnv(raw: RawEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(clean(raw));
  if (!result.success) {
    const problems = result.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${problems.join("\n")}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv();
  return cached;
}

/** Which keys are configured — booleans only, safe to return from /api/health. */
export function envStatus(raw: RawEnv = process.env) {
  const env = clean(raw);
  return {
    nvidia: Boolean(env.NVIDIA_API_KEY),
    supabaseUrl: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
