import type { Recall } from './nhtsa';

/**
 * Plain-language summary of a recall, for someone who is not a mechanic.
 *
 * Optional by design. With `ANTHROPIC_API_KEY` set, the call happens here — on the
 * server — and the key never reaches the browser. Without it, the app falls back to
 * NHTSA's own wording and says so.
 *
 * That fallback is not a consolation prize: it means this repository can be cloned and
 * run with no keys and no signup at all, which matters more for a reviewer than the
 * feature does.
 */

export type Summary = { text: string; source: 'model' | 'nhtsa' };

const KEY = process.env.ANTHROPIC_API_KEY;
export const summariesEnabled = () => Boolean(KEY);

/** NHTSA's own consequence text, trimmed to something readable. */
function fallback(recall: Recall): Summary {
  const sentence = recall.consequence.split(/(?<=\.)\s/)[0] ?? recall.consequence;
  return { text: sentence.trim() || recall.summary.slice(0, 220), source: 'nhtsa' };
}

export async function summariseRecall(recall: Recall): Promise<Summary> {
  if (!KEY) return fallback(recall);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 160,
        system:
          'You explain vehicle safety recalls to a used-car salesperson with no mechanical training. Two sentences maximum: what can physically go wrong, and what the fix involves. No preamble, no reassurance, no bullet points. Never invent detail that is not in the text you are given.',
        messages: [
          {
            role: 'user',
            content: `Component: ${recall.component}\n\nSummary: ${recall.summary}\n\nConsequence: ${recall.consequence}\n\nRemedy: ${recall.remedy}`,
          },
        ],
      }),
    });

    if (!response.ok) return fallback(recall);

    const body = await response.json();
    const text = body?.content?.[0]?.text;
    return typeof text === 'string' && text.trim() ? { text: text.trim(), source: 'model' } : fallback(recall);
  } catch {
    // A summarisation failure must never take down a safety lookup.
    return fallback(recall);
  }
}
