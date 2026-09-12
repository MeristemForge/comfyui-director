import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';

const root = process.cwd();
let vinext = null;
let electron = null;
let ownsVinext = true;
function findFreePort(start = 3000) {
  return new Promise((resolve) => {
    const probe = (port) => {
      const socket = net.createServer();
      socket.once('error', () => probe(port + 1));
      socket.once('listening', () => socket.close(() => resolve(port)));
      socket.listen(port, '127.0.0.1');
    };
    probe(start);
  });
}
function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => finish(new Error(`Vinext 开发服务器启动失败：${error.message}`));
    const onExit = (code, signal) => finish(new Error(`Vinext 开发服务器提前退出（${signal || `退出码 ${code ?? 'unknown'}`}）`));
    child.once('error', onError);
    child.once('exit', onExit);
    const check = () => {
      if (settled) return;
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); finish(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) finish(new Error(`Vinext 开发服务器在 ${port} 端口启动超时`));
        else setTimeout(check, 250);
      });
    };
    check();
  });
}
async function isExistingVinextServer(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes('MeristemForge') && html.includes('vinext');
  } catch {
    return false;
  }
}
function shutdown() { if (ownsVinext && vinext && !vinext.killed) vinext.kill(); if (electron && !electron.killed) electron.kill(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
let devPort;
if (await isExistingVinextServer(3000)) {
  devPort = 3000;
  ownsVinext = false;
} else {
  devPort = await findFreePort(3000);
  vinext = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev', '--hostname', '127.0.0.1', '--port', String(devPort)], { cwd: root, stdio: 'inherit' });
  try {
    await waitForServer(vinext, devPort);
  } catch (error) {
    if (await isExistingVinextServer(3000)) {
      devPort = 3000;
      ownsVinext = false;
    } else {
      console.error(error instanceof Error ? error.message : error);
      shutdown();
      process.exit(1);
    }
  }
}
const devUrl = `http://127.0.0.1:${devPort}`;
electron = spawn(path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron'), ['electron/main.cjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, DIRECTOR_DEV_URL: devUrl }, shell: process.platform === 'win32' });
electron.on('exit', (code) => { shutdown(); process.exit(code ?? 0); });
await once(electron, 'spawn');
