import { run } from './hookrun.ts';

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'hook':
    await run(args[0] ?? '');
    break;
  default:
    console.error(
      `minim: unknown command "${cmd ?? ''}"\n` +
        'usage: minim <hook|budget|stats|mem|pack|init> [args]'
    );
    process.exit(1);
}
