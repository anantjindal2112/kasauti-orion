import type { Metadata } from "next";
import { RulebookView } from "@/components/library/RulebookView";
import { PageHeader } from "@/components/retro/PageHeader";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";

export const metadata: Metadata = { title: "Rulebook" };

export default function RulesPage() {
  const pack = loadBrandPack();

  return (
    <>
      <PageHeader
        icon="rules"
        title="Rulebook"
        subtitle={`${pack.brand.name}'s numbered rules. Every finding Kasauti shows must cite one of these codes — no citation, no finding.`}
        tip={<>Code wherever a rule can be written as code; AI only where judgement is needed.</>}
      />
      <RulebookView defaults={pack} today={DEMO_TODAY} />
    </>
  );
}
