/**
 * Hindi number words to digits ("एक हजार नौ सौ निन्यानवे रुपये" -> "₹1,999"), done in code because the
 * translation model drops words like निन्यानवे (99) and reads them as 90. Spellings vary by speaker and
 * by the speech model, so marks like the nukta and chandrabindu are ignored when matching.
 */
const flat = (s: string) => s.normalize("NFD").replace(/़/g, "").normalize("NFC").replace(/ँ/g, "ं");

const ROWS: string[][] = [
  ["शून्य"], ["एक"], ["दो"], ["तीन"], ["चार"], ["पाँच", "पांच"], ["छह", "छः", "छ", "छै"], ["सात"], ["आठ"], ["नौ"],
  ["दस"], ["ग्यारह"], ["बारह"], ["तेरह"], ["चौदह"], ["पंद्रह", "पन्द्रह"], ["सोलह"], ["सत्रह"], ["अठारह"], ["उन्नीस"],
  ["बीस"], ["इक्कीस"], ["बाईस"], ["तेईस"], ["चौबीस"], ["पच्चीस"], ["छब्बीस"], ["सत्ताईस"], ["अट्ठाईस", "अठाईस"], ["उनतीस"],
  ["तीस"], ["इकतीस"], ["बत्तीस"], ["तैंतीस"], ["चौंतीस"], ["पैंतीस"], ["छत्तीस"], ["सैंतीस"], ["अड़तीस"], ["उनतालीस"],
  ["चालीस"], ["इकतालीस"], ["बयालीस"], ["तैंतालीस"], ["चौवालीस", "चवालीस"], ["पैंतालीस"], ["छियालीस"], ["सैंतालीस"], ["अड़तालीस"], ["उनचास"],
  ["पचास"], ["इक्यावन"], ["बावन"], ["तिरपन", "तिरेपन"], ["चौवन"], ["पचपन"], ["छप्पन"], ["सत्तावन"], ["अट्ठावन", "अठावन"], ["उनसठ"],
  ["साठ"], ["इकसठ"], ["बासठ"], ["तिरसठ", "तिरेसठ"], ["चौंसठ"], ["पैंसठ"], ["छियासठ"], ["सड़सठ"], ["अड़सठ"], ["उनहत्तर"],
  ["सत्तर"], ["इकहत्तर"], ["बहत्तर"], ["तिहत्तर"], ["चौहत्तर"], ["पचहत्तर"], ["छिहत्तर"], ["सतहत्तर"], ["अठहत्तर"], ["उनासी", "उन्यासी"],
  ["अस्सी"], ["इक्यासी"], ["बयासी"], ["तिरासी"], ["चौरासी"], ["पचासी"], ["छियासी"], ["सत्तासी"], ["अट्ठासी", "अठासी"], ["नवासी"],
  ["नब्बे"], ["इक्यानवे"], ["बानवे"], ["तिरानवे"], ["चौरानवे"], ["पंचानवे"], ["छियानवे"], ["सत्तानवे"], ["अट्ठानवे", "अठानवे"], ["निन्यानवे", "निन्यानबे"],
];
const NUMBERS = new Map<string, number>();
ROWS.forEach((forms, n) => forms.forEach((f) => NUMBERS.set(flat(f), n)));
const SCALES = new Map<string, number>([
  ["हजार", 1_000], ["लाख", 100_000], ["करोड", 10_000_000], ["करोड़", 10_000_000],
].map(([w, v]) => [flat(w as string), v as number]));
const HUNDRED = flat("सौ");

const MONEY = new Set(["रुपये", "रुपए", "रुपया", "रू", "रु"].map(flat));
const PERCENT = new Set(["प्रतिशत", "फीसदी", "फ़ीसदी", "परसेंट", "फीसद"].map(flat));

const strip = (w: string) => flat(w.replace(/[^\p{L}\p{M}]/gu, ""));
const isNumberWord = (w: string) => NUMBERS.has(w) || SCALES.has(w) || w === HUNDRED;

function value(words: string[]): number {
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (NUMBERS.has(w)) current += NUMBERS.get(w)!;
    else if (w === HUNDRED) current = (current || 1) * 100;
    else {
      total += (current || 1) * SCALES.get(w)!;
      current = 0;
    }
  }
  return total + current;
}

export function normalizeSpokenHindi(text: string): string {
  const tokens = text.split(/(\s+)/);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = strip(tokens[i]);
    if (!w || !isNumberWord(w)) {
      out.push(tokens[i]);
      continue;
    }
    let j = i;
    let end = i + 1;
    const run: string[] = [];
    while (j < tokens.length) {
      if (tokens[j].trim() === "") {
        j++;
        continue;
      }
      const x = strip(tokens[j]);
      if (!x || !isNumberWord(x)) break;
      run.push(x);
      j++;
      end = j;
    }
    // The word after the number decides what it is: money, a percentage, or just a count.
    let k = end;
    while (k < tokens.length && tokens[k].trim() === "") k++;
    const next = k < tokens.length ? strip(tokens[k]) : "";
    const money = MONEY.has(next);
    const percent = PERCENT.has(next);
    const n = value(run);
    // A lone small word ("दो", "एक", "चार") is usually an ordinary word, so only convert clear quantities.
    if (!(run.length > 1 || n >= 100 || money || percent)) {
      out.push(tokens[i]);
      continue;
    }
    const digits = n.toLocaleString("en-IN");
    const consumed = money || percent ? k + 1 : end;
    const lastRaw = tokens[consumed - 1] ?? "";
    const punct = lastRaw.match(/[^\p{L}\p{M}\s]+$/u)?.[0] ?? "";
    out.push((money ? `₹${digits}` : percent ? `${digits}%` : digits) + punct);
    i = consumed - 1;
  }
  return out.join("");
}
