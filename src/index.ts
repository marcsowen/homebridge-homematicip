import type {API} from 'homebridge';
import type {HmIPPlatformConfig} from './HmIPConfig.js';
import {HmIPPlatform} from './HmIPPlatform.js';
import {PLATFORM_NAME} from './settings.js';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform<HmIPPlatformConfig>(PLATFORM_NAME, HmIPPlatform);
};
