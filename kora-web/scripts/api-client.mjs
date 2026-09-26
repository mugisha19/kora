// Generates TypeScript types from the API contract, or checks that the committed ones are current.
//   node scripts/api-client.mjs generate   → writes src/app/core/api/generated/schema.ts
//   node scripts/api-client.mjs check      → fails if the committed file differs from a fresh generation
// openapi-typescript runs through npx because its TypeScript 5 peer conflicts with Angular's TS 6 (ADR 0005).
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERATOR = 'openapi-typescript@7.13.0';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contract = join(root, '../kora-api/docs/openapi.yaml');
const committed = join(root, 'src/app/core/api/generated/schema.ts');

function generate(output) {
  // One command string (paths quoted): `npx` is a .cmd shim on Windows and needs a shell.
  // --default-non-nullable=false: a schema `default` (e.g. currency RWF) must stay optional in requests.
  execSync(`npx --yes ${GENERATOR} "${contract}" -o "${output}" --default-non-nullable=false`, {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

const normalize = (text) => text.replace(/\r\n/g, '\n');
const mode = process.argv[2];

if (mode === 'generate') {
  generate(committed);
  console.log(`Generated ${committed}`);
} else if (mode === 'check') {
  const dir = mkdtempSync(join(tmpdir(), 'kora-api-'));
  try {
    const fresh = join(dir, 'schema.ts');
    generate(fresh);
    if (normalize(readFileSync(fresh, 'utf8')) !== normalize(readFileSync(committed, 'utf8'))) {
      console.error(
        'API types are out of date with kora-api/docs/openapi.yaml. Run: npm run api:generate',
      );
      process.exit(1);
    }
    console.log('API types match the contract.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else {
  console.error('Usage: node scripts/api-client.mjs generate|check');
  process.exit(2);
}
