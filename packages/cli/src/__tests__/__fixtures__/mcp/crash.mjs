// SC-002 crash run (mcp-stdout.spec.ts): a preload (`node --import`) that polls for the file
// named by ELIGIAN_NOISE_TRIGGER and throws an uncaught exception once it exists.
import { existsSync } from 'node:fs';

const trigger = process.env.ELIGIAN_NOISE_TRIGGER;
if (trigger !== undefined) {
  const timer = setInterval(() => {
    if (!existsSync(trigger)) return;
    clearInterval(timer);
    throw new Error('CRASH-SENTINEL uncaught exception from the preload');
  }, 20);
  timer.unref();
}
