/**
 * withFirebaseStaticFix.js — SpiceStrong
 *
 * React Native Firebase requires `useFrameworks: "static"` on iOS, but that
 * triggers the Xcode error:
 *   include of non-modular header inside framework module 'RNFBApp...'
 *   [-Werror,-Wnon-modular-include-in-framework-module]
 *
 * This config plugin injects a Podfile post_install hook that sets
 * CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES on every pod
 * target, which is the documented fix for that error.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BUILD_SETTING = 'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES';

const INJECT = `
    # Added by withFirebaseStaticFix — allow non-modular includes (React Native Firebase + static frameworks)
    installer.pods_project.targets.each do |fb_target|
      fb_target.build_configurations.each do |fb_config|
        fb_config.build_settings['${BUILD_SETTING}'] = 'YES'
      end
    end`;

module.exports = function withFirebaseStaticFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (!contents.includes(BUILD_SETTING)) {
        // Insert our loop at the start of the existing post_install hook.
        contents = contents.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|${INJECT}`,
        );
        fs.writeFileSync(podfilePath, contents);
      }
      return cfg;
    },
  ]);
};
