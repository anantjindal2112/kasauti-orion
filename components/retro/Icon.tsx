import type { CSSProperties } from "react";

/** Tiny pixel-art icons drawn on a 16×16 grid with crisp edges. */
export type IconName = "home" | "scan" | "ledger" | "rules" | "flask" | "chart" | "help" | "check" | "warn" | "cross" | "arrow" | "image" | "spark";

const PATHS: Record<IconName, string> = {
  home: "M7 1h2v1h1v1h1v1h1v1h1v1h1v2h-2v7H9v-4H7v4H3V8H1V6h1V5h1V4h1V3h1V2h2z",
  scan: "M6 1h4v1h2v1h1v2h1v4h-1v2h-1v1h1v1h1v1h1v1h-2v-1h-1v-1h-1v-1h-1v1H6v-1H4v-1H3V9H2V5h1V3h1V2h2zm0 2v1H5v1H4v4h1v1h1v1h4v-1h1V9h1V5h-1V4h-1V3z",
  ledger: "M2 1h10v1h1v13H3v-1H2zm2 2v10h7V3zm1 2h5v1H5zm0 2h5v1H5zm0 2h3v1H5z",
  rules: "M1 2h3v3H1zm4 1h10v1H5zM1 7h3v3H1zm4 1h10v1H5zM1 12h3v3H1zm4 1h10v1H5z",
  flask: "M5 1h6v2h-1v4h1v1h1v2h1v2h1v3H1v-3h1v-2h1V8h1V7h1V3H5zm2 2v5H6v1H5v2H4v2h8v-2h-1V9h-1V8H9V3z",
  chart: "M1 1h2v12h12v2H1zm4 7h2v4H5zm4-4h2v8H9zm4 2h2v6h-2z",
  help: "M6 1h4v1h2v1h1v4h-1v1h-1v1H9v2H7V8h1V7h2V6h1V4h-1V3H6v1H5v1H3V3h1V2h2zm1 11h2v2H7z",
  check: "M13 3h2v2h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H5v-1H4v-1H3v-1H2V9H1V7h2v1h1v1h1v1h1v1h1v-1h1V9h1V8h1V7h1V6h1V5h1z",
  warn: "M7 1h2v2h1v2h1v2h1v2h1v2h1v2h1v2H1v-2h1v-2h1V9h1V7h1V5h1V3h1zm0 4v5h2V5zm0 6v2h2v-2z",
  cross: "M2 2h3v1h1v1h1v1h2V4h1V3h1V2h3v3h-1v1h-1v1h-1v2h1v1h1v1h1v3h-3v-1h-1v-1H9v-1H7v1H6v1H5v1H2v-3h1v-1h1v-1h1V9h1V7H5V6H4V5H3V4H2z",
  arrow: "M9 2h2v1h1v1h1v1h1v1h1v4h-1v1h-1v1h-1v1h-1v1H9v-2h1v-1h1V9H1V7h10V6h-1V5H9z",
  image: "M1 2h14v12H1zm2 2v8h10V4zm6 2h2v2H9zM4 11v-1h1V9h1V8h1v1h1v1h1v1h1v-1h1v1h1v1z",
  spark: "M7 1h2v4h1v1h1v1h4v2h-4v1h-1v1H9v4H7v-4H6v-1H5V9H1V7h4V6h1V5h1z",
};

export function Icon({ name, className = "h-4 w-4", style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 16 16" className={`shrink-0 ${className}`} style={style} fill="currentColor" shapeRendering="crispEdges" aria-hidden>
      <path fillRule="evenodd" d={PATHS[name]} />
    </svg>
  );
}
