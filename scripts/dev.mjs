import { createServer } from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

function optimizePrompt(body) {
  return new Promise((resolve, reject) => {
    const executable = String(body.executablePath || '').trim();
    if (!executable) return reject(new Error('未配置本地 Agent 可执行程序路径'));
    const isCodex = /codex/i.test(path.basename(executable));
    const args = isCodex
      ? ['--ask-for-approval', 'never', 'exec', '-', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never']
      : ['-p', String(body.prompt || ''), '--output-format', 'text'];
    const child = spawn(executable, args, { cwd: process.cwd(), windowsHide: true, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable), stdio: isCodex ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('本地 Agent 优化超时')); }, 120000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`无法启动本地 Agent：${error.message}`)); });
    child.on('close', (code) => { clearTimeout(timer); if (code !== 0) return reject(new Error(stderr.trim() || `Agent 退出码 ${code}`)); const prompt = stdout.trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '').trim(); if (!prompt) return reject(new Error('本地 Agent 未返回优化结果')); resolve({ prompt }); });
    if (isCodex) child.stdin.end(String(body.prompt || ''));
  });
}

const helper = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/optimize-prompt') { response.writeHead(404); response.end(); return; }
  try { let raw = ''; for await (const chunk of request) raw += chunk; const result = await optimizePrompt(JSON.parse(raw)); response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result)); }
  catch (error) { response.writeHead(500, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : '提示词优化失败' })); }
});
helper.listen(3101, '127.0.0.1');
const vinext = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev', '--hostname', '0.0.0.0'], { stdio: 'inherit', shell: false });

function shutdown() {
  helper.close();
  helper.close();
  vinext.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
vinext.on('exit', (code) => process.exit(code ?? 0));
