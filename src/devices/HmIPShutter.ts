import type {
  CharacteristicValue,
  Service,
} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface ShutterChannel {
  functionalChannelType: string;
  shutterLevel: number; // 0.0 = open, 1.0 = closed
  processing: boolean;
}

/**
 * HomematicIP shutter
 *
 * HMIP-FROLL (Shutter Actuator - flush-mount)
 * HMIP-BROLL (Shutter Actuator - Brand-mount)
 *
 */
export class HmIPShutter extends HmIPGenericDevice {
  protected service: Service;

  // Values are HomeKit style (100..0)
  protected shutterLevel = 0;
  protected processing = false;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.service = this.accessory.getService(this.platform.Service.WindowCovering)
      || this.accessory.addService(this.platform.Service.WindowCovering);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .onGet(() => this.shutterLevel);

    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .onGet(() => this.shutterLevel)
      .onSet(value => this.handleTargetPositionSet(value));

    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .onGet(() => this.processing
        ? this.platform.Characteristic.PositionState.DECREASING
        : this.platform.Characteristic.PositionState.STOPPED);

    this.service.getCharacteristic(this.platform.Characteristic.HoldPosition)
      .onSet(value => this.handleHoldPositionSet(value));
  }

  private async handleTargetPositionSet(value: CharacteristicValue): Promise<void> {
    this.platform.log.info('Setting target shutter position for %s to %s %%', this.accessory.displayName, value);
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      shutterLevel: HmIPShutter.shutterHomeKitToHmIP(Number(value)),
    };
    await this.platform.connector.command('device/control/setShutterLevel', body);
  }

  private async handleHoldPositionSet(value: CharacteristicValue): Promise<void> {
    this.platform.log.info('Setting shutter hold position for %s to %s', this.accessory.displayName, value);
    if (value === true) {
      const body = {
        channelIndex: 1,
        deviceId: this.accessory.context.device.id,
      };
      await this.platform.connector.command('device/control/stop', body);
    }
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'SHUTTER_CHANNEL' || channel.functionalChannelType === 'BLIND_CHANNEL') {
        const shutterChannel = <ShutterChannel>channel;

        const shutterLevelHomeKit = HmIPShutter.shutterHmIPToHomeKit(shutterChannel.shutterLevel);
        if (shutterLevelHomeKit !== this.shutterLevel) {
          this.shutterLevel = shutterLevelHomeKit;
          this.platform.log.debug('Current shutter level of %s changed to %s %%', this.accessory.displayName, this.shutterLevel.toFixed(0));
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.shutterLevel);
          this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.shutterLevel);
        }

        if (shutterChannel.processing !== this.processing) {
          this.processing = shutterChannel.processing;
          this.platform.log.debug('Processing state of shutter/blind %s changed to %s', this.accessory.displayName, this.processing);
          this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.processing ?
            this.platform.Characteristic.PositionState.DECREASING : this.platform.Characteristic.PositionState.STOPPED);
        }

      }
    }
  }

  protected static shutterHmIPToHomeKit(hmIPValue: number): number {
    return (1 - hmIPValue) * 100.0;
  }

  protected static shutterHomeKitToHmIP(homeKitValue: number): number {
    return (100 - homeKitValue) / 100.0;
  }
}
