#!/usr/bin/env node
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'hook': {
    const { run } = await import('../src/hookrun.js');
    await run(args[0]);
    break;
  }
  case 'budget': {
    const { run } = await import('../src/cli/budget.js');
    run(args);
    break;
  }
  case 'stats': {
    const { run } = await import('../src/cli/stats.js');
    run(args);
    break;
  }
  case 'mem': {
    const { run } = await import('../src/cli/mem.js');
    run(args);
    break;
  }
  case 'pack': {
    const { run } = await import('../src/cli/pack.js');
    run(args);
    break;
  }
  default:
    console.error(`minim: unknown command "${cmd ?? ''}"\nusage: minim hook <Event>`);
    process.exit(1);
}
