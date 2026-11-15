import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Pixelify_Sans, Space_Mono, Tiro_Devanagari_Hindi } from "next/font/google";
import { Providers } from "@/components/retro/Providers";
import { Taskbar } from "@/components/retro/Taskbar";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "700"] });
const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"] });
/** Numbers: retro terminal feel, but far easier to read than the pixel font. */
const num = Space_Mono({ variable: "--font-num", subsets: ["latin"], weight: ["400", "700"] });
const tiro = Tiro_Devanagari_Hindi({ variable: "--font-tiro", subsets: ["devanagari", "latin"], weight: "400" });

export const metadata: Metadata = {
  title: { default: "Kasauti — brand truth, tested before it's published", template: "%s · Kasauti" },
  description:
    "A brand-governance verifier: every finding cites an approved source, every claim carries proof, every fix keeps the creator's intent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${pixel.variable} ${num.variable} ${tiro.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>
          <a
            href="#main"
            className="sr-only z-[60] border-2 border-ink bg-yellow px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            Skip to content
          </a>
          <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
            {children}
          </main>
          <Taskbar />
        </Providers>
      </body>
    </html>
  );
}
