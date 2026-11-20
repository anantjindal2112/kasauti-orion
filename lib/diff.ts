export interface DiffPart {
  type: "same" | "add" | "del";
  text: string;
}

/** A word-level diff between two versions of a draft (longest common subsequence), for the version history. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter((x) => x.length);
  const b = after.split(/(\s+)/).filter((x) => x.length);
  const m = a.length;
  const n = b.length;
  if (m * n > 4_000_000) return [{ type: "del", text: before }, { type: "add", text: after }];
  const lcs = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last?.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < m) push("del", a[i++]);
  while (j < n) push("add", b[j++]);
  return out;
}
