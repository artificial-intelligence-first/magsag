import {
  loadMcpSummaries,
  loadPlanSummary
} from '@magsag/demo-shared';

const printMcpSummary = async (): Promise<void> => {
  const summaries = await loadMcpSummaries();
  if (summaries.length === 0) {
    console.log('No MCP presets found under tools/adk/servers.');
    return;
  }
  console.log('MCP presets found:');
  for (const summary of summaries) {
    const description = summary.description ? ` — ${summary.description}` : '';
    const transports =
      summary.transports.length > 0
        ? summary.transports.join(', ')
        : 'unknown';
    console.log(`  • ${summary.id}${description}`);
    console.log(`    transports: ${transports}`);
    console.log(`    file: ${summary.file}`);
  }
};

const printPlanSummary = async (): Promise<void> => {
  const summary = await loadPlanSummary();
  console.log('Repository Cleanup ExecPlan snapshot:');
  if (summary.status.length > 0) {
    console.log('  Status updates:');
    summary.status.forEach((line) => console.log(`    - ${line}`));
  }
  if (summary.planOfWork.length > 0) {
    console.log('  Plan of work:');
    summary.planOfWork.forEach((line, index) =>
      console.log(`    ${index + 1}. ${line}`)
    );
  }
  if (summary.followUp.length > 0) {
    console.log('  Follow-up items:');
    summary.followUp.forEach((line) => console.log(`    - ${line}`));
  }
};

const printHelp = (): void => {
  console.log('Usage: magsag-demo-cli <command>');
  console.log('');
  console.log('Commands:');
  console.log('  mcp   Show available MCP presets and transports');
  console.log('  plan  Summarise the repository cleanup ExecPlan');
};

const main = async (): Promise<void> => {
  const [command] = process.argv.slice(2);
  try {
    switch (command) {
      case 'mcp':
        await printMcpSummary();
        break;
      case 'plan':
        await printPlanSummary();
        break;
      case undefined:
        printHelp();
        break;
      default:
        console.error(`Unknown command '${command}'.`);
        printHelp();
        process.exitCode = 1;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error occurred.';
    console.error(message);
    process.exitCode = 1;
  }
};

main();
