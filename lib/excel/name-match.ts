/** Name comparison that ignores case, spaces, dots and punctuation: "Hariesh.S" == "hariesh s". */
export const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/**
 * 0..1 similarity between two names. A missing trailing initial ("Sakthi Sugesh" vs
 * "Sakthi Sugesh R") still scores high.
 */
export function nameSimilarity(a: string, b: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const longer = Math.max(ka.length, kb.length);
  let score = 1 - levenshtein(ka, kb) / longer;
  // One is the other plus an initial or two.
  if ((ka.startsWith(kb) || kb.startsWith(ka)) && Math.abs(ka.length - kb.length) <= 2) score = Math.max(score, 0.92);
  return score;
}

export const MATCH_THRESHOLD = 0.8;

export function bestMatches<T extends { fullName: string }>(name: string, candidates: T[], limit = 3) {
  return candidates
    .map((c) => ({ candidate: c, score: nameSimilarity(name, c.fullName) }))
    .filter((m) => m.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
