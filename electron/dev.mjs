import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';

const root = process.cwd();
const vinext = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev', '--hostname', '127.0.0.1', '--port', '3000'], { cwd: root, stdio: 'inherit' });
let electron = null;
function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000;
    const check = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port: 3000 });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error('Vinext 开发服务器启动超时'));
        else setTimeout(check, 250);
      });
    };
    check();
  });
}
function shutdown() { if (!vinext.killed) vinext.kill(); if (electron && !electron.killed) electron.kill(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
await waitForServer();
electron = spawn(path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron'), ['electron/main.cjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, DIRECTOR_DEV_URL: 'http://127.0.0.1:3000' }, shell: process.platform === 'win32' });
electron.on('exit', (code) => { shutdown(); process.exit(code ?? 0); });
await once(electron, 'spawn');
