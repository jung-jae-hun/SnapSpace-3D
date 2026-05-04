#!/usr/bin/env node

import { createHash } from 'crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = process.env.SNAPSPACE_SMOKE_OUTPUT_DIR ?? path.resolve(process.cwd(), '.tmp', 'smoke');
const REPORT_PATH = process.env.SNAPSPACE_SMOKE_REPORT_PATH ?? path.join(OUTPUT_DIR, 'smoke-flow-latest.md');
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

function now() {
  return new Date().toISOString();
}

async function listGlbFiles(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const glbNames = names.filter((name) => name.endsWith('.glb'));
  const entries = [];

  for (const name of glbNames) {
    const fullPath = path.join(dir, name);
    const fileStat = await stat(fullPath);
    entries.push({ fullPath, name, mtimeMs: fileStat.mtimeMs, size: fileStat.size });
  }

  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries;
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const lines = [];
  lines.push('# Smoke Flow Report');
  lines.push('');
  lines.push(`- generatedAt: ${now()}`);
  lines.push(`- outputDir: ${OUTPUT_DIR}`);

  const files = await listGlbFiles(OUTPUT_DIR);
  lines.push(`- glbFileCount: ${files.length}`);
  lines.push('');

  if (files.length === 0) {
    lines.push('No GLB output found. Run `pnpm smoke:flow` first.');
  } else {
    const latest = files[0];
    const checksum = await sha256File(latest.fullPath);

    lines.push('## Latest GLB');
    lines.push('');
    lines.push(`- file: ${latest.name}`);
    lines.push(`- sizeBytes: ${latest.size}`);
    lines.push(`- modifiedAt: ${new Date(latest.mtimeMs).toISOString()}`);
    lines.push(`- sha256: ${checksum}`);
    lines.push('');

    lines.push('## Recent Outputs');
    lines.push('');
    const recent = files.slice(0, 5);
    for (const item of recent) {
      lines.push(`- ${item.name} (${item.size} bytes)`);
    }
  }

  const markdown = `${lines.join('\n')}\n`;
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, markdown, 'utf8');

  if (STEP_SUMMARY) {
    await writeFile(STEP_SUMMARY, `${markdown}\n`, { encoding: 'utf8', flag: 'a' });
  }

  console.log(`[smoke-flow-report] wrote ${REPORT_PATH}`);
}

main().catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[smoke-flow-report] failed: ${reason}`);
  process.exitCode = 1;
});
