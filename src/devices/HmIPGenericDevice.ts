import {PlatformAccessory} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPHome} from '../HmIPState';

/**
 * Generic device
 */
export abstract class HmIPGenericDevice {

    protected constructor(
      protected readonly platform: HmIPPlatform,
      protected home: HmIPHome,
      public readonly accessory: PlatformAccessory,
    ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.oem)
            .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.modelType)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion);
    }

}
