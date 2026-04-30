#!/usr/bin/env node

const required = ['DATABASE_URL'];
const missing = required.filter((name) => !process.env[name] || process.env[name].trim() === '');

if (missing.length === 0) {
  process.exit(0);
}

console.error('[api:start] Missing required environment variables:', missing.join(', '));
console.error('[api:start] Use one of these commands from repository root:');
console.error('  - pnpm dev:api:local');
console.error('  - pnpm dev:api:local:smoke');
console.error('[api:start] Or export DATABASE_URL before running @snapspace/api start.');
process.exit(1);
