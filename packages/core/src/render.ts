import type { SearchResult } from './search.ts';

export function renderSearchResult(result: SearchResult, query: string): string {
  if (result.hits.length === 0) {
    return (
      `No recorded decisions match "${query}". ` +
      'Nothing is known about this yet — proceed, and record what you learn with the minim_remember tool.'
    );
  }
  const lines = result.hits.map((h) => (h.date ? `- [${h.date}] ${h.fact}` : `- ${h.fact}`));
  const header = `Recorded decisions matching "${query}":`;
  const footer =
    result.truncated > 0
      ? `\n\n(${result.truncated} more match but were withheld to save tokens. Use a narrower query if none of the above answer the question.)`
      : '';
  return `${header}\n${lines.join('\n')}${footer}`;
}
