/**
 * Gemini key rotation — tries KEY_1, KEY_2, KEY_3, KEY_4, KEY in order.
 * On quota error (429 / RESOURCE_EXHAUSTED) switches to next key automatically.
 * Loops back to start after the last key.
 */
import { GoogleGenAI } from "@google/genai";

export function getKeys(): string[] {
  const keys: string[] = [];
  for (const name of [
    "GEMINI_API_KEY_1",
    "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3",
    "GEMINI_API_KEY_4",
    "GEMINI_API_KEY",
    "GEMINI_KEY",
  ]) {
    const v = process.env[name];
    if (v && v !== "MY_GEMINI_API_KEY" && v.length > 10) keys.push(v);
  }
  // Deduplicate
  return [...new Set(keys)];
}

function isQuotaError(err: any): boolean {
  const msg = String(err?.message || err?.status || err || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("resourceexhausted") ||
    msg.includes("rate limit") ||
    err?.status === 429
  );
}

/**
 * Call fn(ai) with automatic key rotation on quota errors.
 * fn receives a GoogleGenAI instance; throw on non-quota errors.
 */
export async function withKeyRotation<T>(
  fn: (ai: GoogleGenAI) => Promise<T>
): Promise<T> {
  const keys = getKeys();
  if (keys.length === 0) throw new Error("Aucune clé Gemini configurée.");

  let lastErr: any;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });
      return await fn(ai);
    } catch (err: any) {
      if (isQuotaError(err)) {
        console.warn(`Gemini key #${i + 1} quota épuisé → essai suivant`);
        lastErr = err;
        continue;
      }
      throw err; // Non-quota error → propagate immediately
    }
  }
  throw new Error(`Toutes les clés Gemini sont épuisées. Dernière erreur: ${lastErr?.message}`);
}

/** Returns true if at least one key is configured */
export function hasKeys(): boolean {
  return getKeys().length > 0;
}
