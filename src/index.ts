#!/usr/bin/env bun
import { executeCommand, UsageError } from "./cli/commandRouter";
import { parseArgs, renderHelp } from "./cli/parseArgs";

const USAGE_HINT = "Hint: run with --help to see usage.";

async function main(): Promise<void> {
  const parsed = parseArgs(Bun.argv.slice(2));

  if (parsed.options.help && parsed.errors.length === 0) {
    process.stdout.write(`${renderHelp()}\n`);
    process.exit(0);
  }

  if (parsed.errors.length > 0) {
    process.stderr.write(`${parsed.errors.join("\n")}\n`);
    process.stderr.write(`${USAGE_HINT}\n`);
    process.exit(2);
    return;
  }

  if (!parsed.command) {
    process.stderr.write("Command is required\n");
    process.stderr.write(`${USAGE_HINT}\n`);
    process.exit(2);
    return;
  }

  try {
    const markdown = await executeCommand(parsed);
    process.stdout.write(markdown);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(2);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

void main();
