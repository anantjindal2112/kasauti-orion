import { findRegex } from "@/lib/checks/text";
import type { RawFinding, TextCheck } from "@/lib/checks/types";

/** Lowercase hashtags this long almost always join several words. */
const MIN_MULTIWORD_LENGTH = 8;

/** KSR-5.3 — multi-word hashtags in CamelCase so screen readers read them as words. */
export const checkHashtags: TextCheck = (text, { pack }) => {
  // Known phrases we can split confidently: product names and the brand's short name.
  const known = [...pack.brand.products, pack.brand.name.split(/\s/)[0]];
  return findRegex(text, /#[\p{L}\p{N}_]+/gu).flatMap((m): RawFinding[] => {
    const tag = m.text.slice(1);
    if (tag !== tag.toLowerCase() || tag.length < MIN_MULTIWORD_LENGTH || /^\d+$/.test(tag)) return [];
    const phrase = known.find((k) => k.replace(/\W/g, "").toLowerCase() === tag);
    return [
      {
        rule: "KSR-5.3",
        match: m,
        explanation: `"${m.text}" looks like several words run together. Write it in CamelCase so screen readers can read it.`,
        suggestedFix: phrase ? `#${phrase.replace(/\W/g, "")}` : null,
        // A heuristic: a long lowercase tag could still be one word.
        confidence: 0.85,
      },
    ];
  });
};

export interface ImageInput {
  file: string;
  alt: string | null;
}

const FILENAME_ALT = /^(?:img|image|photo|pic|dsc|screenshot)?[-_\s]?\d*\.(?:jpe?g|png|gif|webp|svg|avif)$|^(?:img|image|photo|pic)[-_\s]?\d*$/i;

/** KSR-5.1 — every image needs real alt text. */
export function checkAltText(images: ImageInput[]): { file: string; explanation: string }[] {
  return images.flatMap((img) => {
    const alt = img.alt?.trim() ?? "";
    if (!alt) return [{ file: img.file, explanation: "This image has no alt text. Describe what it shows." }];
    if (FILENAME_ALT.test(alt) || alt === img.file.split("/").at(-1)) {
      return [{ file: img.file, explanation: `The alt text "${alt}" is a file name, not a description.` }];
    }
    return [];
  });
}
