const { spawn } = require('node:child_process');
const path = require('node:path');
const root = process.env.DIRECTOR_APP_ROOT || path.resolve(__dirname, '..', '..');
const workingDirectory = process.env.DIRECTOR_WORKING_DIRECTORY || process.cwd();
const distRoot = process.env.DIRECTOR_DIST_ROOT || path.join(root, 'dist');
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js');
const wranglerArgs = ['dev', '--config', path.join(distRoot, 'server', 'wrangler.json'), '--local', '--ip', '127.0.0.1', '--port', process.env.DIRECTOR_SERVER_PORT || '3000'];
// Electron's Node mode keeps the script path in process.argv. Set the argv
// shape Wrangler expects and compile its entry point as the main module.
const bootstrap = [
  "const fs = require('node:fs');",
  "const Module = require('node:module');",
  `const filename = ${JSON.stringify(wranglerCli)};`,
  "const mainModule = new Module(filename);",
  "mainModule.filename = filename;",
  `mainModule.paths = Module._nodeModulePaths(${JSON.stringify(path.dirname(wranglerCli))});`,
  "require.main = mainModule; process.mainModule = mainModule;",
  `process.argv = [process.execPath, ...${JSON.stringify(wranglerArgs)}];`,
  "mainModule._compile(fs.readFileSync(filename, 'utf8'), filename);",
].join(' ');
const child = spawn(process.execPath, ['-e', bootstrap], { cwd: workingDirectory, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true });
child.on('exit', (code) => process.exit(code ?? 0));
