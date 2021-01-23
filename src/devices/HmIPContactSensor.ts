import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

enum WindowState {
  OPEN = "OPEN",
  CLOSED = "CLOSED",
  TILTED = "TILTED"
}

interface ContactChannel {
  functionalChannelType: string;
  windowState: WindowState;
  eventDelay: number;
}

/**
 * HomematicIP contact devices
 *
 * HMIP-SWDO (Door / Window Contact - optical)
 * HMIP-SWDO-I (Door / Window Contact Invisible - optical)
 * HMIP-SWDM /  HMIP-SWDM-B2  (Door / Window Contact - magnetic)
 * HmIP-SWDO-PL ( Window / Door Contact – optical, plus)
 * HMIP-SCI (Contact Interface Sensor)
 * HMIP-SRH
 *
 */
export class HmIPContactSensor extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private windowState = WindowState.CLOSED;
  private eventDelay = 0;

  constructor(
    platform: HmIPPlatform,
    home: HmIPHome,
    accessory: PlatformAccessory,
  ) {
    super(platform, home, accessory);

    this.platform.log.debug(`Created HmIPContactSensor ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(home, accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .on('get', this.handleContactSensorStateGet.bind(this));
  }

  handleContactSensorStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.windowState === WindowState.CLOSED
      ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  }

  public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPHome, hmIPDevice, groups);
    this.home = hmIPHome;
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'SHUTTER_CONTACT_CHANNEL'
          || channel.functionalChannelType === 'CONTACT_INTERFACE_CHANNEL'
          || channel.functionalChannelType === 'ROTARY_HANDLE_CHANNEL') {

        const wthChannel = <ContactChannel>channel;
        this.platform.log.debug(`Contact update: ${JSON.stringify(channel)}`);

        if (wthChannel.windowState !== this.windowState) {
          this.platform.log.info(`Contact state of ${this.accessory.displayName} changed to '${wthChannel.windowState}'`);
          this.windowState = wthChannel.windowState;
          this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.windowState === WindowState.CLOSED
            ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
            : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
        }

        if (wthChannel.eventDelay !== this.eventDelay) {
          this.platform.log.info(`Event delay of ${this.accessory.displayName} changed to ${wthChannel.eventDelay}`);
          this.eventDelay = wthChannel.eventDelay;
        }
      }
    }
  }
}
