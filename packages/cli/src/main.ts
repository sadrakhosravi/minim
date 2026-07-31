import { run } from './hookrun.ts';
import { run as budget } from './cli/budget.ts';
import { run as stats } from './cli/stats.ts';
import { run as mem } from './cli/mem.ts';
import { run as pack } from './cli/pack.ts';
import { run as init } from './cli/init.ts';

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'hook':
    await run(args[0] ?? '');
    break;
  case 'budget':
    budget();
    break;
  case 'stats':
    stats();
    break;
  case 'mem':
    mem(args);
    break;
  case 'pack':
    pack(args);
    break;
  case 'init':
    init();
    break;
  default:
    console.error(
      `minim: unknown command "${cmd ?? ''}"\n` +
        'usage: minim <hook|budget|stats|mem|pack|init> [args]'
    );
    process.exit(1);
}
