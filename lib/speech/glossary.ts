/**
 * How the demo brand's names are usually written in Devanagari (speech-to-text spells them by sound).
 * Before translating Hindi to English these are swapped for the real English names, so "मॉनसून वीव"
 * becomes "Monsoon Weave" instead of "Monsoon View".
 */
export const HINDI_SPELLINGS: Record<string, string[]> = {
  "Dhaaga & Co.": ["धागा एंड कंपनी", "धागा एंड को", "धागा एण्ड को", "धागा एन्ड को", "धागा एंड कं"],
  "Monsoon Weave": ["मॉनसून वीव", "मॉनसून बीव", "मानसून वीव", "मानसून बीव", "मॉनसून वीभ", "मॉनसून वी"],
  "Indigo Hours": ["इंडिगो ऑवर्स", "इंडिगो आवर्स", "इंडिगो ऑवर", "इंडिगो आवर"],
  "Kesar Collection": ["केसर कलेक्शन", "केसर कलेक्शन्स"],
};
