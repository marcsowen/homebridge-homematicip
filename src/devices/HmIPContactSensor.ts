import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
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
  private contactService: Service;
  private windowService: Service;

  private windowState = WindowState.CLOSED;
  private eventDelay = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created HmIPContactSensor ${accessory.context.device.label}`);
    this.contactService = this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor);
    this.contactService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);
    this.contactService.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .on('get', this.handleContactSensorStateGet.bind(this));

    this.windowService = this.accessory.getService(this.platform.Service.Window) || this.accessory.addService(this.platform.Service.Window);
    this.windowService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);
    this.windowService.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .on('get', this.handleWindowCurrentPositionGet.bind(this));
    this.windowService.getCharacteristic(this.platform.Characteristic.PositionState)
      .on('get', this.handleWindowPositionStateGet.bind(this));
    this.windowService.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .on('get', this.handleWindowTargetPositionGet.bind(this))
      .on('set', this.handleWindowTargetPositionSet.bind(this));

    this.updateDevice(accessory.context.device, platform.groups);
  }

  handleContactSensorStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.windowState === WindowState.CLOSED
      ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  }

  handleWindowCurrentPositionGet(callback: CharacteristicGetCallback) {
    callback(null, this.getWindowPosition());
  }

  handleWindowPositionStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.platform.Characteristic.PositionState.STOPPED);
  }

  handleWindowTargetPositionGet(callback: CharacteristicGetCallback) {
    callback(null, this.getWindowPosition());
  }

  handleWindowTargetPositionSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Ignoring setting target position for %s to %s', this.accessory.displayName, value);
    callback(null);
  }


  private getWindowPosition(): number {
    switch (this.windowState) {
      case WindowState.CLOSED:
        return 0;
      case WindowState.TILTED:
        return 50;
      case WindowState.OPEN:
        return 100;
    }
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
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
          this.contactService.updateCharacteristic(this.platform.Characteristic.ContactSensorState,
            this.windowState === WindowState.CLOSED
              ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
              : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
          this.windowService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.getWindowPosition());
          this.windowService.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.getWindowPosition());
        }

        if (wthChannel.eventDelay !== this.eventDelay) {
          this.platform.log.info(`Event delay of ${this.accessory.displayName} changed to ${wthChannel.eventDelay}`);
          this.eventDelay = wthChannel.eventDelay;
        }
      }
    }
  }
}
