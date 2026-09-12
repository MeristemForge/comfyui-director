import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const marker = path.join(root, ".runtime-build-path");
const extractorDirectory = path.join(root, ".runtime-extractor");
const archiveName = "runtime.7z";

const archive = process.env.COMFYUI_RUNTIME_ARCHIVE ||
  path.resolve(root, "build-assets", archiveName);
if (existsSync(archive)) {
  if (statSync(archive).size === 0) {
    throw new Error(`${archive} 当前是空文件，请等待 7-Zip 压缩完成后再执行 npm run electron:dist。`);
  }
  const sevenZipDirectory = path.dirname(process.env.SEVEN_ZIP_PATH || "C:\\Program Files\\7-Zip\\7z.exe");
  const sevenZip = path.join(sevenZipDirectory, "7z.exe");
  const sevenZipDll = path.join(sevenZipDirectory, "7z.dll");
  if (!existsSync(sevenZip) || !existsSync(sevenZipDll)) {
    throw new Error(`找不到 7-Zip：${sevenZipDirectory}`);
  }
  execFileSync(sevenZip, ["t", archive], { stdio: "inherit" });
  mkdirSync(extractorDirectory, { recursive: true });
  cpSync(sevenZip, path.join(extractorDirectory, "7z.exe"));
  cpSync(sevenZipDll, path.join(extractorDirectory, "7z.dll"));
  writeFileSync(marker, JSON.stringify({ type: "archive", path: path.resolve(archive) }), "utf8");
  console.log(`Using ComfyUI runtime archive: ${archive}`);
  process.exit(0);
}

throw new Error(`找不到 ${archiveName}。请将完整的 runtime.7z 放在 ${path.resolve(root, "build-assets")}，或设置 COMFYUI_RUNTIME_ARCHIVE。`);
