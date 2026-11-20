import type { Role } from "@/lib/workflow";

/**
 * Demo accounts for the fictional brand, one per role, so anyone can try the whole workflow
 * (create, send for review, comment, approve). They only ever see demo data.
 */
export const DEMO_PASSWORD = "kasauti-demo";

export const DEMO_ACCOUNTS: { email: string; name: string; role: Role; blurb: string }[] = [
  { email: "creator@dhaaga.example", name: "Meera Shah", role: "creator", blurb: "Writes copy, saves it, sends it for review." },
  { email: "reviewer@dhaaga.example", name: "Kabir Nair", role: "reviewer", blurb: "Comments on findings, approves or asks for changes." },
  { email: "manager@dhaaga.example", name: "Asha Rao", role: "manager", blurb: "Decides, and can reopen an approved piece." },
  { email: "admin@dhaaga.example", name: "Vikram Iyer", role: "admin", blurb: "Sees everything, including the audit log." },
];
