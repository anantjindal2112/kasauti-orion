import type { BrandPack } from "@/lib/brand-pack";
import { HINDI_SPELLINGS } from "@/lib/speech/glossary";

/**
 * The same brand terms in Hindi (Devanagari) and in Hinglish (Hindi in Roman letters), so the code checks work on
 * Hindi copy directly and findings quote the original Hindi. Added next to the English lists, never instead of them:
 * a Hindi post with an English product name, or an English post, is checked by both.
 * Hindi has no capital letters, so the shouting check has nothing to do there; the rest of the voice checks
 * (stacked "!!!", emoji) work on any script.
 */
export const HINDI_TERMS = {
  banned: [
    ...["सस्ता", "सस्ती", "सस्ते", "sasta", "sasti", "saste"].map((term) => ({ term, rule: "KSR-2.3", reason: "Undercuts the craft positioning." })),
    ...["चमत्कारी", "चमत्कार", "chamatkari", "chamatkar"].map((term) => ({ term, rule: "KSR-2.3", reason: "Unprovable." })),
    ...["केमिकल-फ्री", "केमिकल फ्री", "बिना केमिकल", "chemical free"].map((term) => ({ term, rule: "KSR-2.3", reason: "Scientifically false — everything is made of chemicals." })),
    ...["वर्ल्ड-क्लास", "वर्ल्ड क्लास", "विश्वस्तरीय", "world class"].map((term) => ({ term, rule: "KSR-2.3", reason: "Empty superlative." })),
  ],
  replace: [
    ...["मज़दूरों", "मजदूरों", "श्रमिकों"].map((term) => ({ term, with: "कारीगरों", rule: "KSR-2.2" })),
    ...["मज़दूर", "मजदूर", "श्रमिक"].map((term) => ({ term, with: "कारीगर", rule: "KSR-2.2" })),
    ...["यहाँ क्लिक करें", "यहां क्लिक करें", "क्लिक करें", "बायो में लिंक", "लिंक इन बायो"].map((term) => ({ term, with: "a description of where the link goes", rule: "KSR-5.2" })),
  ],
  superlatives: [
    "सबसे भरोसेमंद", "सबसे भरोसेमन्द", "सबसे अच्छा", "सबसे अच्छी", "सबसे अच्छे", "सबसे बेहतरीन", "बेहतरीन", "सर्वश्रेष्ठ", "नंबर 1", "नम्बर 1", "नंबर वन", "नंबर एक", "नं. 1",
    "अग्रणी", "सबसे बड़ा", "सबसे बड़ी", "सबसे कम कीमत", "सबसे पसंदीदा", "सबसे ज़्यादा पसंद", "सबसे ज्यादा पसंद", "भारत का पसंदीदा", "टॉप-रेटेड", "टॉप रेटेड", "बेस्ट",
    "sabse bharosemand", "sabse accha", "sabse achha", "number 1", "number one",
  ],
  absoluteClaims: [
    "100% सुरक्षित", "100 प्रतिशत सुरक्षित", "गारंटीड", "गारंटी", "कभी फीका नहीं", "कभी फेड नहीं", "कभी नहीं उतरता", "हमेशा के लिए", "हमेशा चलेगा", "ज़ीरो केमिकल", "जीरो केमिकल",
    "पूरी तरह टॉक्सिन-फ्री", "जोखिम-मुक्त", "रिस्क-फ्री", "kabhi fade nahi", "kabhi nahi utarta",
  ],
  pressurePhrases: [
    "आखिरी मौका", "आख़िरी मौका", "वरना पछताएंगे", "पछताना पड़ेगा", "मौका न चूकें", "मौका मत चूकिए", "मौका मत चूकें", "बहुत देर हो जाएगी", "किसका इंतज़ार", "किसका इंतजार",
    "mauka mat chukiye", "pachtaoge", "aakhri mauka",
  ],
  claimCandidates: [
    "प्रमाणित", "ऑर्गेनिक", "पर्यावरण-अनुकूल", "पर्यावरण के अनुकूल", "इको-फ्रेंडली", "टिकाऊ", "ग्रीन", "पुरस्कार-विजेता", "पुरस्कार विजेता", "अवॉर्ड-विनिंग",
    "हाथ से बुना", "हाथ से बुनी", "हाथ से बुने", "हैंडवोवन", "हस्तनिर्मित", "थ्रेड काउंट", "रेटिंग",
  ],
};

/** Words that say what a ledger entry is about, in Hindi, by topic. */
export const HINDI_TOPIC_WORDS: Record<string, string[]> = {
  shipping: ["शिपिंग", "डिलीवरी", "डिलिवरी"],
  sale: ["सेल", "छूट", "ऑफर", "डिस्काउंट"],
  returns: ["रिटर्न", "वापसी", "रिफंड", "एक्सचेंज"],
  reviews: ["रेटिंग", "समीक्षा", "रिव्यू", "ग्राहक", "ग्राहकों"],
  artisans: ["कारीगर", "कारीगरों", "बुनकर", "बुनकरों"],
};

const merged = new WeakSet<object>();
const cache = new WeakMap<BrandPack, BrandPack>();

/** The pack with the Hindi and Hinglish terms added to its lists. Safe to call again on its own output. */
export function withHindiTerms(pack: BrandPack): BrandPack {
  if (merged.has(pack)) return pack;
  const hit = cache.get(pack);
  if (hit) return hit;
  const t = pack.terms;
  const union = <T,>(a: T[], b: T[], key: (x: T) => string) => [...a, ...b.filter((x) => !a.some((y) => key(y).toLowerCase() === key(x).toLowerCase()))];
  const out: BrandPack = {
    ...pack,
    terms: {
      ...t,
      banned: union(t.banned, HINDI_TERMS.banned, (x) => x.term),
      replace: union(t.replace, HINDI_TERMS.replace, (x) => x.term),
      superlatives: union(t.superlatives, HINDI_TERMS.superlatives, (x) => x),
      absoluteClaims: union(t.absoluteClaims, HINDI_TERMS.absoluteClaims, (x) => x),
      pressurePhrases: union(t.pressurePhrases, HINDI_TERMS.pressurePhrases, (x) => x),
      claimCandidates: union(t.claimCandidates, HINDI_TERMS.claimCandidates, (x) => x),
      // The brand and product names are written in English letters; Devanagari spellings of them are the wrong ones.
      brandName: { ...t.brandName, wrong: [...t.brandName.wrong, ...(HINDI_SPELLINGS[t.brandName.correct] ?? [])] },
      productNames: t.productNames.map((p) => ({ ...p, wrong: [...p.wrong, ...(HINDI_SPELLINGS[p.correct] ?? [])] })),
    },
  };
  merged.add(out);
  cache.set(pack, out);
  return out;
}
