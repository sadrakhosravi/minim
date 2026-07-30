export async function readStdinJson() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function respond(obj = {}) {
  process.stdout.write(JSON.stringify({ continue: true, ...obj }));
}

// Defensive field access: VS Code hook payloads are Preview-stage;
// accept both snake_case and camelCase names.
export function field(input, ...names) {
  if (!input || typeof input !== 'object') return undefined;
  for (const n of names) {
    if (input[n] !== undefined) return input[n];
  }
  return undefined;
}
