import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, SabotageChannel, Updateable} from '../HmIPState';
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
 *
 */
export class HmIPContactSensor extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private windowState = WindowState.CLOSED;
  private sabotage = false;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug('Created HmIPContactSensor %s', accessory.context.device.label);

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);
    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .on('get', this.handleContactSensorStateGet.bind(this));

    if (this.featureSabotage) {
      this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
        .on('get', this.handleStatusTamperedGet.bind(this));
    }

    this.updateDevice(accessory.context.device, platform.groups);
  }

  handleContactSensorStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.windowState === WindowState.CLOSED
      ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  }

  handleStatusTamperedGet(callback: CharacteristicGetCallback) {
    callback(null, this.sabotage
      ? this.platform.Characteristic.StatusTampered.TAMPERED
      : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'SHUTTER_CONTACT_CHANNEL'
          || channel.functionalChannelType === 'CONTACT_INTERFACE_CHANNEL') {

        const wthChannel = <ContactChannel>channel;
        this.platform.log.debug(`Contact update: ${JSON.stringify(channel)}`);

        if (wthChannel.windowState !== this.windowState) {
          this.windowState = wthChannel.windowState;
          this.platform.log.info('Contact state of %s changed to %s', this.accessory.displayName, this.windowState);
          this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState,
            this.windowState === WindowState.CLOSED
              ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
              : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
        }
      }

      if (channel.functionalChannelType === 'DEVICE_SABOTAGE') {
        const sabotageChannel = <SabotageChannel>channel;
        if (sabotageChannel.sabotage != null && sabotageChannel.sabotage !== this.sabotage) {
          this.sabotage = sabotageChannel.sabotage;
          this.platform.log.info('Sabotage state of %s changed to %s', this.accessory.displayName, this.sabotage);
          this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.sabotage
            ? this.platform.Characteristic.StatusTampered.TAMPERED
            : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
        }
      }
    }
  }
}
