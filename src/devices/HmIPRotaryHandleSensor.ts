import type {CharacteristicValue, Service} from 'homebridge';
import type {HmIPDevice, HmIPGroup} from 'homematicip-cloud-client-ts';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

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
export class HmIPRotaryHandleSensor extends HmIPGenericDevice {
  private service: Service;

  private windowState = WindowState.CLOSED;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created HmIPRotaryHandleSensor ${accessory.context.device.label}`);
    this.service = this.getOrAddService(this.platform.Service.Window, accessory.context.device.label);
    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .onGet(() => this.getWindowPosition());
    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .onGet(() => this.platform.Characteristic.PositionState.STOPPED);
    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .onGet(() => this.getWindowPosition())
      .onSet(value => this.handleWindowTargetPositionSet(value));

  }

  private handleWindowTargetPositionSet(value: CharacteristicValue): void {
    this.platform.log.info('Ignoring setting target position for %s to %s', this.accessory.displayName, value);
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

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
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
