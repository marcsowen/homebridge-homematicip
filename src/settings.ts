import {createRequire} from 'node:module';

interface PackageMetadata {
  name: string;
  version: string;
}

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json') as PackageMetadata;

/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'HomematicIP';

/**
 * Package metadata used for Homebridge registration and protocol communication
 */
export const PLUGIN_NAME = packageMetadata.name;
export const PLUGIN_VERSION = packageMetadata.version;
