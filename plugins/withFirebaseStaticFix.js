/**
 * Force CocoaPods to use modular headers globally.
 * This satisfies Firebase requirements without triggering New Architecture C++ errors.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withModularHeadersFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return cfg;
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(
          /use_react_native!\(/,
          `use_modular_headers!\n  use_react_native!(`
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return cfg;
    },
  ]);
};
