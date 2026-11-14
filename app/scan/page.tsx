import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/retro/PageHeader";
import { Window } from "@/components/retro/Window";
import { Scanner } from "@/components/scan/Scanner";
import { demoDrafts, evidenceIndex, ruleIndex, stressDrafts } from "@/lib/demo";

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
            Pick <b>D01</b> under Quick picks to see the deck&rsquo;s stale-price example, then press <b>Accept fix</b>.
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
        <Scanner drafts={[...demoDrafts(), ...stressDrafts()]} rules={ruleIndex()} evidence={evidenceIndex()} />
      </Suspense>
    </>
  );
}
