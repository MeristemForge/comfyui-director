const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const child = spawn(process.execPath, [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'dev', '--config', path.join(root, 'dist', 'server', 'wrangler.json'), '--local'], { cwd: root, stdio: 'ignore', windowsHide: true });
child.on('exit', (code) => process.exit(code ?? 0));
