import type { Metadata } from "next";
import { Customiser } from "@/components/customise/Customiser";
import { PageHeader } from "@/components/retro/PageHeader";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";

export const metadata: Metadata = { title: "Customise" };

export default function CustomisePage() {
  return (
    <>
      <PageHeader
        icon="spark"
        title="Customise"
        subtitle="Make Kasauti yours: brand name and voice, limits, banned words, competitors, every rule and every proof in the Claim Ledger."
        tip={
          <>
            Change something, press <b>Save</b>, then run a scan — the scanner uses your version straight away.
          </>
        }
      />
      <Customiser defaults={loadBrandPack()} defaultToday={DEMO_TODAY} />
    </>
  );
}
