import {PlatformAccessory} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

/**
 * HomematicIP Push Button
 */
export class HmIPPushButton extends HmIPGenericDevice implements Updateable {
  //private service: Service;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created HmIPPushButton ${accessory.context.device.label}`);
    /*
    FIXME: how to read state of button? SINGLE_KEY_CHANNEL index=1 "upper", and the other is "lower" button, but the state
           is not sent on the API.

    this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);
    */
    this.updateDevice(accessory.context.device, platform.groups);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      this.platform.log.debug(`Push button update: ${JSON.stringify(channel)}`);
    }
  }
}
