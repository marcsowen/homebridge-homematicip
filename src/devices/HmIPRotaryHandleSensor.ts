import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

enum WindowState {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  TILTED = 'TILTED'
}

interface RotaryHandleChannel {
  functionalChannelType: string;
  windowState: WindowState;
  eventDelay: number;
}

/**
 * HomematicIP rotary handle sensor
 *
 * HMIP-SRH
 */
export class HmIPRotaryHandleSensor extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private windowState = WindowState.CLOSED;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created HmIPRotaryHandleSensor ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.Window) || this.accessory.addService(this.platform.Service.Window);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);
    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .on('get', this.handleWindowCurrentPositionGet.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .on('get', this.handleWindowPositionStateGet.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .on('get', this.handleWindowTargetPositionGet.bind(this))
      .on('set', this.handleWindowTargetPositionSet.bind(this));

    this.updateDevice(accessory.context.device, platform.groups);
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
      if (channel.functionalChannelType === 'ROTARY_HANDLE_CHANNEL') {

        const rotaryHandleChannel = <RotaryHandleChannel>channel;
        this.platform.log.debug('Rotary handle update: %s', JSON.stringify(channel));

        if (rotaryHandleChannel.windowState !== this.windowState) {
          this.windowState = rotaryHandleChannel.windowState;
          this.platform.log.info('Rotary handle state of %s changed to %s', this.accessory.displayName, this.windowState);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.getWindowPosition());
          this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.getWindowPosition());
        }
      }
    }
  }
}
