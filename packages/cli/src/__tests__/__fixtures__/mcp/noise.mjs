// SC-002 noise run (mcp-stdout.spec.ts): a preload (`node --import`) that polls for the file
// named by ELIGIAN_NOISE_TRIGGER. Once it exists, it writes one sentinel each through
// console.log, console.info, console.debug and process.stdout.write. The methods are looked
// up at that moment, so they go through whatever the server installed by then.
import { existsSync } from 'node:fs';

const trigger = process.env.ELIGIAN_NOISE_TRIGGER;
if (trigger !== undefined) {
  const timer = setInterval(() => {
    if (!existsSync(trigger)) return;
    clearInterval(timer);
    console.log('NOISE-SENTINEL-console.log');
    console.info('NOISE-SENTINEL-console.info');
    console.debug('NOISE-SENTINEL-console.debug');
    process.stdout.write('NOISE-SENTINEL-stdout.write\n');
  }, 20);
  timer.unref();
}
