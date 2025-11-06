#!/usr/bin/env node

/**
 * PDCA helper script
 *
 * Proxies to `magsag agent plan`, forwarding all CLI arguments while allowing
 * STDIN to provide the prompt when omitted.
 */

import { runCli } from '@magsag/cli';

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--') {
    args.shift();
  }
  const exitCode = await runCli(['agent', 'plan', ...args]);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
};

await main();
