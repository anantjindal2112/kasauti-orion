import type { IconName } from "@/components/retro/Icon";

/** Every page, in the order a judge should explore them. One source for the taskbar and the home page. */
export const NAV: { href: string; label: string; short: string; icon: IconName; file: string; blurb: string }[] = [
  { href: "/", label: "Home", short: "Home", icon: "home", file: "KASAUTI.EXE", blurb: "Start here" },
  { href: "/scan", label: "Scan a draft", short: "Scan", icon: "scan", file: "SCAN.EXE", blurb: "Paste or pick a draft, run the checks, accept or dispute each finding." },
  { href: "/testset", label: "Test set", short: "Tests", icon: "flask", file: "TESTSET.DAT", blurb: "18 sample drafts with known mistakes — and how many Kasauti catches." },
  { href: "/ledger", label: "Claim Ledger", short: "Ledger", icon: "ledger", file: "LEDGER.DAT", blurb: "Every approved claim with its source, owner and expiry date." },
  { href: "/rules", label: "Rulebook", short: "Rules", icon: "rules", file: "RULES.TXT", blurb: "The brand's 27 numbered rules, and how each one is checked." },
  { href: "/insights", label: "Insights", short: "Insights", icon: "chart", file: "RADAR.EXE", blurb: "Guideline Debt Radar: rules people keep arguing with (Round 3)." },
  { href: "/how", label: "How it works", short: "How", icon: "help", file: "README.TXT", blurb: "The pipeline, the Verifier, the trust rules and build status." },
];
