import type { Metadata } from "next";
import { LedgerView } from "@/components/library/LedgerView";
import { ButtonLink } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { PageHeader } from "@/components/retro/PageHeader";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";

export const metadata: Metadata = { title: "Claim Ledger" };

export default function LedgerPage() {
  const pack = loadBrandPack();
  const { brand } = pack;

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
        <ButtonLink href="/scan?draft=S1" variant="primary">
          <Icon name="scan" /> See a stale claim caught
        </ButtonLink>
      </PageHeader>
      <LedgerView defaults={pack} today={DEMO_TODAY} />
    </>
  );
}
