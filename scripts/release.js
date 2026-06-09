#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appJsonPath = path.join(__dirname, '../app.json');

// Read and parse app.json
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

// Initialize buildNumber if it doesn't exist
if (!appJson.expo.ios.buildNumber) {
  appJson.expo.ios.buildNumber = '0';
}

// Increment buildNumber
const currentBuild = parseInt(appJson.expo.ios.buildNumber, 10);
const newBuild = (currentBuild + 1).toString();

appJson.expo.ios.buildNumber = newBuild;

// Write updated app.json
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf8');

console.log(`\n✅ Build number incremented: ${currentBuild} → ${newBuild}`);
console.log(`📱 Version: ${appJson.expo.version} (Build ${newBuild})\n`);

try {
  // Build for iOS
  console.log('🔨 Starting EAS build for iOS...');
  execSync('npx eas build --platform ios --wait', { stdio: 'inherit' });

  console.log('\n✅ Build completed successfully!');

  // Submit to TestFlight
  console.log('📤 Submitting to TestFlight...');
  execSync('npx eas submit --platform ios --latest', { stdio: 'inherit' });

  console.log('\n✅ Successfully submitted to TestFlight!');
  console.log(`🎉 Release complete: Version ${appJson.expo.version}, Build ${newBuild}\n`);
} catch (error) {
  // Revert buildNumber on failure
  appJson.expo.ios.buildNumber = currentBuild.toString();
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf8');

  console.error('\n❌ Release failed. Build number reverted.');
  process.exit(1);
}
