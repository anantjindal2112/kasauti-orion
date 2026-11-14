import type { Metadata } from "next";
import { LedgerTable, type LedgerRow } from "@/components/library/LedgerTable";
import { ButtonLink } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { Counter } from "@/components/retro/Motion";
import { PageHeader } from "@/components/retro/PageHeader";
import { Window } from "@/components/retro/Window";
import { DEMO_TODAY, isExpired, loadBrandPack } from "@/lib/brand-pack";
import { formatDay } from "@/lib/demo";

export const metadata: Metadata = { title: "Claim Ledger" };

const EXPIRING_DAYS = 45;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export default function LedgerPage() {
  const { evidence, brand } = loadBrandPack();
  const rows: LedgerRow[] = evidence.map((e) => {
    const daysLeft = e.expiresAt ? dayDiff(e.expiresAt, DEMO_TODAY) : null;
    const status = !e.expiresAt ? "permanent" : isExpired(e) ? "expired" : daysLeft! <= EXPIRING_DAYS ? "expiring" : "valid";
    return {
      code: e.code,
      title: e.title,
      claim: e.claim,
      source: e.source,
      owner: `${e.owner.name} (${e.owner.role})`,
      verifiedAt: formatDay(e.verifiedAt),
      expiresAt: e.expiresAt ? formatDay(e.expiresAt) : null,
      status,
      daysLeft,
      supersededBy: e.supersededBy,
      conditions: e.conditions,
    };
  });
  const expired = rows.filter((r) => r.status === "expired").length;

  return (
    <>
      <PageHeader
        icon="ledger"
        title="Claim Ledger"
        subtitle={`Proof with an expiry date. Every price, offer, certificate and promise ${brand.name} may publish — with its source, owner and the day it stops being true.`}
        tip={
          <>
            Click <b>“Replaced by …”</b> on an expired entry to jump to the claim that took its place.
          </>
        }
      >
        <ButtonLink href="/scan?draft=D01" variant="primary">
          <Icon name="scan" /> See a stale claim caught
        </ButtonLink>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Window title="ENTRIES" color="teal" bodyClassName="p-4">
          <p className="font-num text-4xl font-bold">
            <Counter value={rows.length} />
          </p>
        </Window>
        <Window title="EXPIRED" color="red" bodyClassName="p-4" delay={0.06}>
          <p className="font-num text-4xl font-bold">
            <Counter value={expired} />
          </p>
        </Window>
        <Window title="DEMO DATE" color="blue" bodyClassName="p-4" delay={0.12}>
          <p className="font-num text-4xl font-bold">{formatDay(DEMO_TODAY)}</p>
        </Window>
      </div>

      <Window title="C:\KASAUTI\LEDGER.DAT" color="teal">
        <p className="mb-4 max-w-3xl text-muted">
          Expiry is checked against a fixed demo date so the seeded stale entries stay stale whenever you look. Claims with no entry here — like “#1” or
          “India’s most trusted” — are flagged as unsupported.
        </p>
        <LedgerTable rows={rows} />
      </Window>
    </>
  );
}
