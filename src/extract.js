const NOTE_RE = /^.*?MINIM-NOTE:[ \t]*(.+)$/gm;

export function extractNotes(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  for (const m of text.matchAll(NOTE_RE)) {
    const fact = m[1].trim();
    if (fact && !out.includes(fact)) out.push(fact);
  }
  return out;
}
