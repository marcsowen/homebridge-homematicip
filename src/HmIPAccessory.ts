import {API, Logger, PlatformAccessory} from 'homebridge';
import {PLATFORM_NAME, PLUGIN_NAME} from './settings';

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
      this.log.debug(`Updating accessory: ${this.accessory.context.device.label} (${this.accessory.context.device.id})-> uuid ${this.accessory.UUID}`);
      this.api.updatePlatformAccessories([this.accessory]);
    } else {
      this.log.info(`Register accessory: ${this.accessory.context.device.label} (${this.accessory.context.device.id}) -> uuid ${this.accessory.UUID}`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
    }
  }
}
