const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (args.includes('--x64') || args.includes('--universal')) {
  console.error('Mac builds support Apple Silicon (arm64) only.');
  process.exit(1);
}
const enableDevTools = args.includes('--devtools');
const builderArgs = args.filter(arg => arg !== '--devtools');
if (!builderArgs.includes('--arm64')) builderArgs.push('--arm64');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['run', 'build']);
run(process.execPath, [
  require.resolve('electron-builder/cli.js'),
  '--mac',
  ...builderArgs,
  `--config.extraMetadata.enableDevTools=${enableDevTools}`,
]);
