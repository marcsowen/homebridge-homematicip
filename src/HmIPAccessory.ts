import {API, Logger, PlatformAccessory} from 'homebridge';
import {PLATFORM_NAME, PLUGIN_NAME} from './settings.js';

/**
 * Accessory wrapper
 */
export class HmIPAccessory {

  public constructor(
    private readonly api: API,
    private readonly log: Logger,
    public readonly accessory: PlatformAccessory,
    private readonly isFromCache: boolean,
  ) {
  }

  public register() {
    if (this.isFromCache) {
      this.log.debug('Updating accessory: %s (%s) -> uuid %s',
        this.accessory.displayName, this.accessory.context.device.id, this.accessory.UUID);
      this.api.updatePlatformAccessories([this.accessory]);
    } else {
      this.log.info('Register accessory: %s (%s) -> uuid %s',
        this.accessory.displayName, this.accessory.context.device.id, this.accessory.UUID);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
    }
  }
}
