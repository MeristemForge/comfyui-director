import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const certificatePath = process.env.CSC_LINK || path.join(root, "build-assets", "certs", "MeristemForge-Local.pfx");
const candidates = [
  process.env.INNO_SETUP_COMPILER,
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Inno Setup 6", "ISCC.exe"),
  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
].filter(Boolean);
const compiler = candidates.find((candidate) => existsSync(candidate));
if (!compiler) throw new Error("找不到 Inno Setup 编译器 ISCC.exe。");
if (!existsSync(certificatePath) || !process.env.CSC_KEY_PASSWORD)
  throw new Error(`制作签名安装包需要证书和密码。证书路径：${certificatePath}`);

const signTool = process.env.MERISTEMFORGE_SIGNTOOL ||
  path.join(process.env.LOCALAPPDATA || "", "electron-builder", "Cache", "winCodeSign", "winCodeSign-2.6.0", "windows-10", "x64", "signtool.exe");
if (!existsSync(signTool)) throw new Error(`找不到 signtool.exe：${signTool}`);

const result = spawnSync(compiler, [path.join(root, "installer", "MeristemForge.iss")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const outputPath = path.join(root, "release", "MeristemForge-Inno-Setup-0.1.0-fixed5.exe");
const signResult = spawnSync(signTool, [
  "sign",
  "/fd", "SHA256",
  "/f", certificatePath,
  "/p", process.env.CSC_KEY_PASSWORD,
  outputPath,
], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
if (signResult.error) throw signResult.error;
if (signResult.status !== 0) process.exit(signResult.status ?? 1);
