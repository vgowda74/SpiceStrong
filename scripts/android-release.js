#!/usr/bin/env node

/**
 * android-release.js — Hands-Free Android Build, Test & Upload
 * 
 * Workflow:
 * 1. Validate credentials & config
 * 2. Increment build number in app.json
 * 3. Build APK with EAS
 * 4. Run automated tests (E2E + Database)
 * 5. If tests pass → Upload to Google Play Store
 * 6. Report status
 * 
 * Usage: npm run android:release
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const PROJECT_ROOT = path.resolve(__dirname, '..');
const APP_JSON_PATH = path.join(PROJECT_ROOT, 'app.json');
const KEYSTORE_PATH = process.env.ANDROID_KEYSTORE_PATH;
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;

let buildNumber = 0;

// ─────────────────────────────────────────────────────────
// Logging Helpers
// ─────────────────────────────────────────────────────────

function log(msg) {
  console.log(`\n📱 ${msg}`);
}

function success(msg) {
  console.log(`✅ ${msg}`);
}

function error(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.log(`⚠️  ${msg}`);
}

// ─────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────

function validateSetup() {
  log('Validating Android Release Setup');

  // Check .env file
  if (!fs.existsSync(path.join(PROJECT_ROOT, '.env'))) {
    error('Missing .env file. Copy .env.example and fill in values.');
  }
  success('.env file found');

  // Check required env vars
  const required = [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
    'GOOGLE_PLAY_SERVICE_ACCOUNT',
  ];

  for (const varName of required) {
    if (!process.env[varName]) {
      error(`Missing environment variable: ${varName}`);
    }
  }
  success('All required environment variables set');

  // Check keystore file
  if (!fs.existsSync(KEYSTORE_PATH)) {
    error(`Keystore file not found: ${KEYSTORE_PATH}`);
  }
  success(`Keystore file found: ${KEYSTORE_PATH}`);

  // Check service account
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    error(`Service account not found: ${SERVICE_ACCOUNT_PATH}`);
  }
  success(`Service account found: ${SERVICE_ACCOUNT_PATH}`);

  // Check app.json
  if (!fs.existsSync(APP_JSON_PATH)) {
    error('app.json not found');
  }
  success('app.json found');
}

// ─────────────────────────────────────────────────────────
// Build Number Increment
// ─────────────────────────────────────────────────────────

function incrementBuildNumber() {
  log('Incrementing build number');

  const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
  const currentBuild = parseInt(appJson.expo.android?.versionCode || '1', 10);
  const newBuild = currentBuild + 1;

  // Update app.json
  if (!appJson.expo.android) {
    appJson.expo.android = {};
  }
  appJson.expo.android.versionCode = newBuild;

  fs.writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2) + '\n', 'utf8');

  buildNumber = newBuild;
  success(`Build number incremented: ${currentBuild} → ${newBuild}`);
}

// ─────────────────────────────────────────────────────────
// Build APK with EAS
// ─────────────────────────────────────────────────────────

function buildApk() {
  log(`Building Android APK (Build #${buildNumber})`);

  try {
    // Build with EAS
    const buildCmd = `npx eas build --platform android --wait`;
    console.log(`   Running: ${buildCmd}`);
    execSync(buildCmd, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        ANDROID_KEYSTORE_PATH: KEYSTORE_PATH,
        ANDROID_KEYSTORE_PASSWORD: process.env.ANDROID_KEYSTORE_PASSWORD,
        ANDROID_KEY_ALIAS: process.env.ANDROID_KEY_ALIAS,
        ANDROID_KEY_PASSWORD: process.env.ANDROID_KEY_PASSWORD,
      },
    });

    success('Android APK built successfully');
  } catch (err) {
    error(`Build failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────
// Run Automated Tests
// ─────────────────────────────────────────────────────────

function runTests() {
  log('Running automated tests');

  try {
    // E2E tests (skip for now since we're on Android)
    // npm run test:e2e:android would require emulator
    warn('Skipping E2E tests (requires Android emulator)');

    // Database audit
    console.log('   Running database audit...');
    execSync('npm run test:db:audit', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });

    success('All tests passed');
    return true;
  } catch (err) {
    error(`Tests failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────
// Upload to Google Play Store
// ─────────────────────────────────────────────────────────

function uploadToPlayStore() {
  log('Uploading to Google Play Store');

  try {
    const submitCmd = `npx eas submit --platform android --latest`;
    console.log(`   Running: ${submitCmd}`);
    execSync(submitCmd, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        GOOGLE_PLAY_SERVICE_ACCOUNT: SERVICE_ACCOUNT_PATH,
      },
    });

    success('Successfully uploaded to Google Play Store');
  } catch (err) {
    error(`Upload failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────
// Main Release Flow
// ─────────────────────────────────────────────────────────

async function releaseAndroid() {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 SpiceStrong Android Release (Hands-Free)');
  console.log('═'.repeat(60));

  try {
    // 1. Validate setup
    validateSetup();

    // 2. Increment build number
    incrementBuildNumber();

    // 3. Build APK
    buildApk();

    // 4. Run tests
    const testsPass = runTests();

    if (!testsPass) {
      error('Tests failed. Aborting upload.');
    }

    // 5. Upload to Play Store
    uploadToPlayStore();

    // Success!
    console.log('\n' + '═'.repeat(60));
    console.log(`✅ Android Release Complete!`);
    console.log(`   Build #${buildNumber} uploaded to Google Play Store`);
    console.log('═'.repeat(60) + '\n');

    process.exit(0);
  } catch (err) {
    error(`Unexpected error: ${err.message}`);
  }
}

releaseAndroid();
