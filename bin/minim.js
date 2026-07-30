#!/usr/bin/env node
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'hook': {
    const { run } = await import('../src/hookrun.js');
    await run(args[0]);
    break;
  }
  default:
    console.error(`minim: unknown command "${cmd ?? ''}"\nusage: minim hook <Event>`);
    process.exit(1);
}
