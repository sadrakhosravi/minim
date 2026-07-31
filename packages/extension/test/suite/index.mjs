// Minimal runner. Avoids a mocha dependency: each suite exports an array of
// [name, asyncFn] pairs, and failures reject so test-electron exits non-zero.
export async function run() {
  const suites = [
    await import('./activation.test.mjs'),
    await import('./tools.test.mjs'),
  ];
  const failures = [];
  for (const suite of suites) {
    for (const [name, fn] of suite.tests) {
      try {
        await fn();
        console.log(`  ok  ${name}`);
      } catch (e) {
        failures.push(`${name}: ${e.message}`);
        console.error(`  FAIL ${name}: ${e.stack}`);
      }
    }
  }
  if (failures.length) throw new Error(`${failures.length} extension test(s) failed`);
}
