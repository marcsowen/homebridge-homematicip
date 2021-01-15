import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface ShutterContactChannel {
  windowState: string;
  eventDelay: number;
}

/**
 * HomematicIP Window shutter contact
 */
export class HmIPShutterContact extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private windowState = 'CLOSED';
  private eventDelay = 0;

  constructor(
    platform: HmIPPlatform,
    home: HmIPHome,
    accessory: PlatformAccessory,
  ) {
    super(platform, home, accessory);

    this.platform.log.debug(`Created HmIPShutterContact ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(home, accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .on('get', this.handleContactSensorStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .on('get', this.handleCurrentDoorStateGet.bind(this));
  }

  handleContactSensorStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.windowState === 'CLOSED'
      ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  }

  handleCurrentDoorStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.windowState === 'CLOSED'
      ? this.platform.Characteristic.CurrentDoorState.CLOSED
      : this.platform.Characteristic.CurrentDoorState.OPEN);
  }


  public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPHome, hmIPDevice, groups);
    this.home = hmIPHome;
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'SHUTTER_CONTACT_CHANNEL') {
        const wthChannel = <ShutterContactChannel><unknown>channel;
        this.platform.log.debug(`Shutter contact update: ${JSON.stringify(channel)}`);

        if (wthChannel.windowState !== this.windowState) {
          this.platform.log.info(`Window state of ${this.accessory.displayName} changed to '${wthChannel.windowState}'`);
          this.windowState = wthChannel.windowState;
          this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.windowState === 'CLOSED'
            ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
            : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, this.windowState === 'CLOSED'
            ? this.platform.Characteristic.CurrentDoorState.CLOSED
            : this.platform.Characteristic.CurrentDoorState.OPEN);
        }

        if (wthChannel.eventDelay !== this.eventDelay) {
          this.platform.log.info(`Event delay of ${this.accessory.displayName} changed to ${wthChannel.eventDelay}`);
          this.eventDelay = wthChannel.eventDelay;
        }
      }
    }
  }
}
