import { describe, expect, it } from "vitest";
import { envStatus, parseServerEnv } from "@/lib/env";

const full = {
  NVIDIA_API_KEY: "nvapi-test",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("parseServerEnv", () => {
  it("accepts a complete env and defaults the NVIDIA base URL", () => {
    const env = parseServerEnv(full);
    expect(env.NVIDIA_BASE_URL).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("names every missing key", () => {
    expect(() => parseServerEnv({})).toThrow(/NVIDIA_API_KEY[\s\S]*SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("treats empty strings as missing", () => {
    expect(() => parseServerEnv({ ...full, NVIDIA_API_KEY: "" })).toThrow(/NVIDIA_API_KEY/);
  });
});

describe("envStatus", () => {
  it("reports booleans only, never values", () => {
    const status = envStatus({ ...full, SUPABASE_SERVICE_ROLE_KEY: "" });
    expect(status).toEqual({
      nvidia: true,
      supabaseUrl: true,
      supabaseAnonKey: true,
      supabaseServiceRole: false,
    });
    expect(JSON.stringify(status)).not.toContain("nvapi-test");
  });
});
