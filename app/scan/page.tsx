import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/retro/PageHeader";
import { Window } from "@/components/retro/Window";
import { Scanner } from "@/components/scan/Scanner";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";
import { demoDrafts, evidenceIndex, ruleIndex, showcaseDrafts } from "@/lib/demo";

export const metadata: Metadata = { title: "Scan a draft" };

export default function ScanPage() {
  return (
    <>
      <PageHeader
        icon="scan"
        title="Scan a draft"
        subtitle="Rub the copy against the brand's approved sources. What is real stays; what is false, stale or unproven leaves a mark — with a reason and a fix."
        tip={
          <>
            Start with <b>Example 1</b>, then press <b>Accept all fixes</b>. Upload your own banner under step 3 to test image reading.
          </>
        }
      />
      <Suspense
        fallback={
          <Window title="C:\KASAUTI\DRAFT.TXT">
            <p className="font-mono">Loading scanner…</p>
          </Window>
        }
      >
        <Scanner
          drafts={[...showcaseDrafts(), ...demoDrafts()]}
          rules={ruleIndex()}
          evidence={evidenceIndex()}
          basePack={loadBrandPack()}
          demoToday={DEMO_TODAY}
        />
      </Suspense>
    </>
  );
}
