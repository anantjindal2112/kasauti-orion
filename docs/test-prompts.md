# Prompts for making test ads

Paste any of these into ChatGPT, Gemini or an NVIDIA chat model, then paste the ad it writes into **Scan a draft** (blank draft → paste → Run Kasauti scan).

The brand is the fictional **Dhaaga & Co.** Facts the ads may use (from the Claim Ledger):

- Products: **Monsoon Weave** bedsheets (₹1,999, 300 thread count), **Indigo Hours** double set (₹2,299), **Kesar Collection** (GOTS-certified organic cotton — Kesar only)
- Free shipping above **₹1,499** · Festive Sale **20% off sitewide, 1–16 November 2026**, not valid on gift cards
- Rated **4.6/5 by 18,000+ customers** · **1,200+ artisans** in Panipat and Varanasi · **azo-free dyes**
- Expired, so using them is a mistake: free shipping above **₹999**, Monsoon Weave at **₹1,799**, **OEKO-TEX** certificate

---

## 1. The messy ad (lots of mistakes — Kasauti should flag many)

```
Write a 120-word Instagram ad for "Dhaaga & Co.", an Indian brand of handwoven cotton bedsheets and towels, for its festive sale.
Write it like a pushy agency in a hurry. Deliberately include ALL of these mistakes, spread naturally through the text:
- spell the brand "Dhaga and Co" once and write one product as "Indigo Hour" instead of "Indigo Hours"
- shout one phrase in ALL CAPS, use "!!!" and at least four emoji
- call it "India's most trusted" and "the #1 bedsheet brand"
- say free shipping above ₹999 and the Monsoon Weave set at ₹1,799
- claim every product is GOTS-certified and that Monsoon Weave is OEKO-TEX certified
- say "eco-friendly", "never fades — guaranteed" and "cheap"
- compare it to a competitor called LoomKart
- say the weavers are "our workers"
- write a price as "Rs. 2299/-"
- end with several calls to action (shop now, follow, refer a friend, download the app) and "click here"
- add two lowercase hashtags like #festivesale
Do not mark or explain the mistakes. Output only the ad.
```

## 2. The subtle ad (looks fine — only the AI reviewer should catch it)

```
Write a warm, well-written 90-word email for "Dhaaga & Co." (handwoven cotton bedsheets and towels, India) announcing a festive sale.
It must read as professional and on-brand, with correct spelling, no shouting and at most one exclamation mark.
Quietly include these subtle problems:
- say the GOTS certification covers "our entire range" (it really covers only the Kesar Collection)
- call the products "sustainable" without saying why
- say "award-winning" without naming the award or year
- mention "20% off" without the end date
- end with three different calls to action
Output only the email.
```

## 3. The clean ad (should pass — tests false alarms)

```
Write an 80-word Instagram caption for "Dhaaga & Co." (handwoven cotton home textiles, India) using ONLY these facts:
- the Monsoon Weave bedsheet set is ₹1,999 and 300 thread count, handwoven by artisans in Panipat
- free shipping on orders above ₹1,499
- the festive sale gives 20% off sitewide until 16 November
Rules: warm, plain language that speaks to "you"; spell the brand exactly "Dhaaga & Co."; at most one exclamation mark and two emoji;
no superlatives (best, #1, most trusted), no "guaranteed", no competitors; end with exactly one call to action;
any hashtags in CamelCase like #FestiveSale. Output only the caption.
```

---

## Built-in stress tests

In the scanner's draft picker, under **Stress tests**:

- **X1 · Everything wrong** — one long ad with about 25 problems of every kind, plus an email address and phone number (so you can watch them get masked before the AI sees the text).
- **X2 · Subtle problems** — reads well; the problems need AI judgement (certification scope, vague green claim, award with no name, offer with no end date, too many calls to action).
