import { generateObject } from 'ai';
import { z } from 'zod';
import type { Headline } from '@/lib/fetchers/news';

// Cheap + fast for short summarization tasks. Slug uses dots (gateway format).
const SUMMARY_MODEL = 'anthropic/claude-haiku-4.5';

const SummariesSchema = z.object({
  summaries: z.array(z.string()),
});

/**
 * Returns a one-sentence English summary for each input headline, in order.
 * On any failure (network, parsing, count mismatch), returns an empty array
 * so the caller can fall back to title-only display.
 */
export async function summarizeHeadlines(headlines: Headline[]): Promise<string[]> {
  if (headlines.length === 0) return [];

  const numbered = headlines
    .map((h, i) => `${i + 1}. [${h.category}] "${h.title}" — ${h.source}`)
    .join('\n');

  const prompt =
    `You are writing a personal morning news brief. For each numbered headline below, ` +
    `write ONE concise sentence in English (max 20 words) that gives the reader the gist. ` +
    `Translate non-English titles. Be factual; do not speculate beyond the headline. ` +
    `Output ${headlines.length} summaries in the same order.\n\n` +
    numbered;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const { object } = await generateObject({
        model: SUMMARY_MODEL,
        schema: SummariesSchema,
        prompt,
        abortSignal: ctrl.signal,
      });
      if (object.summaries.length !== headlines.length) {
        console.warn(
          `claude summary count mismatch: got ${object.summaries.length}, expected ${headlines.length}`,
        );
        return [];
      }
      return object.summaries;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error('summarizeHeadlines failed:', e instanceof Error ? e.message : e);
    return [];
  }
}
