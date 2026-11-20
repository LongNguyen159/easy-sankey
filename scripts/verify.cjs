const {spawnSync} = require('node:child_process');
const path = require('node:path');

// Use our installed TypeScript resolver, so this check follows the same aliases
// and syntax as the app without a separate dependency analyzer/version constraint.
function checkCircularImports() {
  const ts = require('typescript');
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const {options} = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const files = ts.sys.readDirectory(process.cwd(), ['.ts'],
    ['node_modules', 'generated', 'dist', '.electron-tests'], ['src/**/*.ts', 'electron/**/*.ts'])
    .filter(file => !file.endsWith('.d.ts'));
  const known = new Set(files.map(file => path.resolve(file)));
  const graph = new Map();
  for (const file of known) {
    const source = ts.createSourceFile(file, ts.sys.readFile(file), ts.ScriptTarget.Latest, true);
    const edges = new Set();
    function visit(node) {
      let specifier;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const typesOnly = clause?.isTypeOnly || (bindings && ts.isNamedImports(bindings)
          && !clause.name && bindings.elements.length > 0
          && bindings.elements.every(item => item.isTypeOnly));
        if (!typesOnly) specifier = node.moduleSpecifier;
      } else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
        const typesOnly = node.exportClause && ts.isNamedExports(node.exportClause)
          && node.exportClause.elements.length > 0
          && node.exportClause.elements.every(item => item.isTypeOnly);
        if (!typesOnly) specifier = node.moduleSpecifier;
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        specifier = node.arguments[0];
      }
      if (specifier && ts.isStringLiteral(specifier)) {
        const resolved = ts.resolveModuleName(specifier.text, file, options, ts.sys).resolvedModule;
        if (resolved && known.has(path.resolve(resolved.resolvedFileName))) {
          edges.add(path.resolve(resolved.resolvedFileName));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    graph.set(file, edges);
  }
  const visited = new Set(), active = new Map(), stack = [];
  let passed = true;
  function visit(file) {
    if (active.has(file)) {
      console.error('Circular import: ' + [...stack.slice(active.get(file)), file]
        .map(item => path.relative(process.cwd(), item)).join(' → '));
      passed = false;
      return;
    }
    if (visited.has(file)) return;
    active.set(file, stack.length); stack.push(file);
    for (const next of graph.get(file)) visit(next);
    stack.pop(); active.delete(file); visited.add(file);
  }
  for (const file of known) visit(file);
  if (passed) console.log('No circular runtime imports in application TypeScript.');
  return passed;
}

function run(label, entry, args = []) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, [entry, ...args], {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.signal) console.error(`${label} stopped by ${result.signal}`);
  return result.status === 0;
}

const mode = process.argv[2];
if (!['test', 'check'].includes(mode)) {
  throw new Error('Expected test or check.');
}
let passed = true;
if (mode === 'test') {
  passed = run('Database and API tests', require.resolve('./test-database.cjs'));
  const args = process.argv.slice(3);
  const browserPassed = run('Angular tests', require.resolve('@angular/cli/bin/ng.js'),
    ['test', ...(args.length ? args : ['--watch=false', '--browsers=ChromeHeadless'])]);
  passed = browserPassed && passed;
} else {
  require('./build-electron.cjs');
  const checks = [
    ['Application types', require.resolve('typescript/bin/tsc'), ['--noEmit', '-p', 'tsconfig.app.json']],
    ['Test types', require.resolve('typescript/bin/tsc'), ['--noEmit', '-p', 'tsconfig.spec.json']],
    ['Spelling', path.resolve('node_modules/cspell/bin.mjs'), ['src/**/*.ts', 'src/**/*.html']],
  ];
  for (const [label, entry, args] of checks) {
    passed = run(label, entry, args) && passed;
  }
  console.log('\nCircular imports (explicit type-only imports excluded)');
  passed = checkCircularImports() && passed;
}
process.exitCode = passed ? 0 : 1;
