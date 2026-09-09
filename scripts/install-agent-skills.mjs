#!/usr/bin/env node

import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const source = path.join(repoRoot, "skills", "director-video");
const userRoot = process.env.USERPROFILE || process.env.HOME || process.cwd();
const targets = [
  process.env.CODEX_HOME || path.join(userRoot, ".codex"),
  process.env.CLAUDE_HOME || path.join(userRoot, ".claude"),
];
const local = process.argv.includes("--local");
if (local) {
  targets.push(path.join(repoRoot, ".codex"), path.join(repoRoot, ".claude"));
}
for (const root of new Set(targets)) {
  const target = path.join(root, "skills", "director-video");
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  process.stdout.write(`installed ${target}\n`);
}
