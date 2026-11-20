"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/retro/Button";
import { Window } from "@/components/retro/Window";
import type { MeState } from "@/lib/client-api";

/** What a protected page shows when nobody is signed in, or the shared database isn't set up on this server. */
export function SignInNotice({ state }: { state: MeState["status"] }) {
  const path = usePathname();
  if (state === "loading") return <p className="font-mono text-sm text-muted">Checking who you are…</p>;
  if (state === "nodb")
    return (
      <Window title="C:\KASAUTI\NO_DATABASE.TXT" color="red" bodyClassName="space-y-2 p-5">
        <p className="font-bold">The shared database isn&rsquo;t set up on this server.</p>
        <p className="text-sm text-muted">Sign-in, review and the audit log need it. The scanner still works without it.</p>
      </Window>
    );
  return (
    <Window title="C:\KASAUTI\SIGN_IN.TXT" color="yellow" bodyClassName="space-y-3 p-5">
      <p className="font-bold">Sign in to see this page.</p>
      <p className="text-sm text-muted">There are demo accounts for every role, so you can try the whole review flow.</p>
      <ButtonLink href={`/login?next=${encodeURIComponent(path)}`} variant="primary">
        Sign in
      </ButtonLink>
    </Window>
  );
}
