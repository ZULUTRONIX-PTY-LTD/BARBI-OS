export const VECTOR_DIMENSIONS = 768;

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'of', 'to', 'in',
  'for', 'with', 'that', 'this', 'it', 'as', 'be', 'are', 'was', 'were', 'by',
  'from', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can',
  'could', 'about', 'into', 'than', 'then', 'when', 'where', 'what', 'who',
]);

export function tokenizeNormalized(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-_.+/ ]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function fnv1a32(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic L2-normalized 768-dim embedding fallback so pgvector cosine
 * distance queries remain functional even offline or without external API calls.
 */
export function deterministicEmbed768(text: string): number[] {
  const vec = new Array<number>(VECTOR_DIMENSIONS).fill(0);
  const tokens = tokenizeNormalized(text);
  if (tokens.length === 0) {
    vec[0] = 1;
    return vec;
  }

  for (const tok of tokens) {
    // Word hash across multiple projections
    for (let k = 0; k < 4; k++) {
      const h = fnv1a32(tok, 2166136261 + k * 2654435761);
      const idx = h % VECTOR_DIMENSIONS;
      const sign = (h & 1) === 0 ? 1 : -1;
      vec[idx] += sign * (tok.length >= 5 ? 1.35 : 1.0);
    }
    // Character 3-grams for morphological similarity
    const padded = `^${tok}$`;
    for (let i = 0; i <= padded.length - 3; i++) {
      const tri = padded.slice(i, i + 3);
      const h = fnv1a32(tri, 374761393);
      const idx = h % VECTOR_DIMENSIONS;
      const sign = (h & 2) === 0 ? 1 : -1;
      vec[idx] += sign * 0.45;
    }
  }

  let normSq = 0;
  for (let i = 0; i < VECTOR_DIMENSIONS; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq) || 1;
  for (let i = 0; i < VECTOR_DIMENSIONS; i++) {
    vec[i] = Number((vec[i] / norm).toFixed(6));
  }
  return vec;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (!denom) return 0;
  return dot / denom;
}

export function toPgVectorLiteral(vec: number[]): string {
  const clean = vec.slice(0, VECTOR_DIMENSIONS).map((n) => (Number.isFinite(n) ? Number(n.toFixed(6)) : 0));
  while (clean.length < VECTOR_DIMENSIONS) clean.push(0);
  return `[${clean.join(',')}]`;
}

export interface ConflictAnalysisResult {
  relation: 'IDENTICAL' | 'CONTRADICTION' | 'PROGRESSION' | 'UNRELATED';
  overlapScore: number;
  reason: string;
}

export function detectContradictionOrProgression(
  existingContent: string,
  candidateContent: string
): ConflictAnalysisResult {
  const normA = String(existingContent || '').trim();
  const normB = String(candidateContent || '').trim();
  if (!normA || !normB) {
    return { relation: 'UNRELATED', overlapScore: 0, reason: 'Empty comparison payload' };
  }
  if (normA.toLowerCase() === normB.toLowerCase()) {
    return { relation: 'IDENTICAL', overlapScore: 1, reason: 'Exact content match' };
  }

  const tokA = new Set(tokenizeNormalized(normA));
  const tokB = new Set(tokenizeNormalized(normB));
  let shared = 0;
  for (const t of tokA) {
    if (tokB.has(t)) shared++;
  }
  const unionSize = new Set([...tokA, ...tokB]).size || 1;
  const overlapScore = shared / unionSize;

  if (overlapScore < 0.22) {
    return { relation: 'UNRELATED', overlapScore, reason: 'Low semantic overlap' };
  }

  const lowA = normA.toLowerCase();
  const lowB = normB.toLowerCase();

  // Negation / opposing epistemic status checks
  const hasNegA = /\b(not yet|outstanding|incomplete|aspirational|planned|discontinued|never)\b/.test(lowA);
  const hasPosB = /\b(graduated|completed|achieved|verified|finished|current income)\b/.test(lowB);
  if (hasNegA && hasPosB) {
    return {
      relation: 'CONTRADICTION',
      overlapScore,
      reason: 'Opposing completion/epistemic status detected against existing verified/pending record.',
    };
  }

  // Conflicting numeric values on overlapping subject
  const numsA = Array.from(lowA.matchAll(/\b\d+(?:\.\d+)?\b/g)).map((m) => m[0]);
  const numsB = Array.from(lowB.matchAll(/\b\d+(?:\.\d+)?\b/g)).map((m) => m[0]);
  if (numsA.length > 0 && numsB.length > 0 && numsA.join(',') !== numsB.join(',')) {
    return {
      relation: 'CONTRADICTION',
      overlapScore,
      reason: `Quantitative mismatch detected (${numsA.join(', ')} vs ${numsB.join(', ')}).`,
    };
  }

  return {
    relation: 'PROGRESSION',
    overlapScore,
    reason: 'Consistent additive update expanding existing topic context.',
  };
}

export function classifyMemoryNodeMeta(text: string): { category: string; domain: string } {
  const lower = String(text || '').toLowerCase();
  if (/\b(tut|bengtech|n6|honours|uct|wits|phd|ecsa|cswp|altium|module)\b/.test(lower)) {
    return { category: 'CREDENTIAL', domain: 'academic' };
  }
  if (/\b(zulutronix|shap-zx1|man317b|esp32|surveillance|bess|lora|xiaozhi|barbi)\b/.test(lower)) {
    return { category: 'PROJECT', domain: 'enterprise' };
  }
  if (/\b(amani|nicky|alfred|daughter|father|family|born|birthday)\b/.test(lower)) {
    return { category: 'PERSONAL_MILESTONE', domain: 'identity' };
  }
  if (/\b(prefer|learning style|si units|decimal|first-principles)\b/.test(lower)) {
    return { category: 'PREFERENCE', domain: 'identity' };
  }
  if (/\b(stress|heat|dynamics|thermodynamics|vibration|pid|kalman|eigen|tensor)\b/.test(lower)) {
    return { category: 'ENGINEERING_PRINCIPLE', domain: 'mechanical' };
  }
  return { category: 'KNOWLEDGE', domain: 'core' };
}
