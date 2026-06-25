#!/usr/bin/env node

/**
 * Sync server-only API keys from .env to Supabase Edge Function secrets.
 *
 * Usage:
 *   node scripts/sync-supabase-secrets.js          # dry run, prints names only
 *   node scripts/sync-supabase-secrets.js --apply  # writes secrets to linked Supabase project
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const projectRefArg = args.find((arg) => arg.startsWith('--project-ref='));
const projectRef = projectRefArg ? projectRefArg.split('=')[1] : '';

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env file.');
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(envPath));

const secretMappings = [
  ['ANTHROPIC_API_KEY', ['ANTHROPIC_API_KEY', 'EXPO_PUBLIC_ANTHROPIC_KEY']],
  ['OPENAI_API_KEY', ['OPENAI_API_KEY', 'EXPO_PUBLIC_OPENAI_KEY']],
  ['ELEVENLABS_KEY', ['ELEVENLABS_KEY', 'EXPO_PUBLIC_ELEVENLABS_KEY']],
  ['FAL_KEY', ['FAL_KEY', 'EXPO_PUBLIC_FAL_KEY']],
  ['EDAMAM_APP_ID', ['EDAMAM_APP_ID', 'EXPO_PUBLIC_EDAMAM_APP_ID']],
  ['EDAMAM_APP_KEY', ['EDAMAM_APP_KEY', 'EXPO_PUBLIC_EDAMAM_APP_KEY']],
  ['EDAMAM_FOOD_APP_ID', ['EDAMAM_FOOD_APP_ID', 'EXPO_PUBLIC_EDAMAM_FOOD_APP_ID']],
  ['EDAMAM_FOOD_APP_KEY', ['EDAMAM_FOOD_APP_KEY', 'EXPO_PUBLIC_EDAMAM_FOOD_APP_KEY']],
  ['SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_ROLE_KEY']],
];

const secrets = {};
for (const [secretName, envNames] of secretMappings) {
  const sourceName = envNames.find((name) => parsed[name] && parsed[name].trim());
  if (sourceName) {
    secrets[secretName] = parsed[sourceName].trim();
  }
}

const names = Object.keys(secrets);
if (names.length === 0) {
  console.log('No server-side secrets found to sync.');
  process.exit(0);
}

console.log(`Found ${names.length} secret(s) to sync:`);
for (const name of names) {
  console.log(`- ${name}`);
}

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to sync these to Supabase Edge Function secrets.');
  process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicestrong-supabase-secrets-'));
const tmpEnvPath = path.join(tmpDir, '.env');

try {
  const body = names
    .map((name) => `${name}=${JSON.stringify(secrets[name])}`)
    .join('\n');
  fs.writeFileSync(tmpEnvPath, `${body}\n`, { mode: 0o600 });

  const commandArgs = ['supabase', 'secrets', 'set', '--env-file', tmpEnvPath];
  if (projectRef) commandArgs.push('--project-ref', projectRef);

  const result = spawnSync('npx', commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}
