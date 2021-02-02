import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

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
export class HmIPShutter extends HmIPGenericDevice implements Updateable {
  protected service: Service;

  // Values are HomeKit style (100..0)
  protected shutterLevel = 0;
  private processing = false;

  constructor(
    platform: HmIPPlatform,
    home: HmIPHome,
    accessory: PlatformAccessory,
  ) {
    super(platform, home, accessory);

    this.service = this.accessory.getService(this.platform.Service.WindowCovering) || this.accessory.addService(this.platform.Service.WindowCovering);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(home, accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .on('get', this.handleCurrentPositionGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .on('set', this.handleTargetPositionSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .on('get', this.handlePositionStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.HoldPosition)
      .on('set', this.handleHoldPositionSet.bind(this));
  }

  handleCurrentPositionGet(callback: CharacteristicGetCallback) {
    callback(null, this.shutterLevel);
  }

  async handleTargetPositionSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting target shutter position for %s to %s', this.accessory.displayName, value);
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      shutterLevel: HmIPShutter.shutterHomeKitToHmIP(<number>value),
    };
    await this.platform.connector.apiCall('device/control/setShutterLevel', body);
    callback(null);
  }

  handlePositionStateGet(callback: CharacteristicGetCallback) {
    if (this.processing) {
      callback(null, this.platform.Characteristic.PositionState.DECREASING);
    } else {
      callback(null, this.platform.Characteristic.PositionState.STOPPED);
    }
  }

  async handleHoldPositionSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting shutter hold position for %s to %s', this.accessory.displayName, value);
    if (value === true) {
      const body = {
        channelIndex: 1,
        deviceId: this.accessory.context.device.id
      };
      await this.platform.connector.apiCall('device/control/stop', body);
    }
    callback(null);
  }

  public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPHome, hmIPDevice, groups);
    this.home = hmIPHome;
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'SHUTTER_CHANNEL' || channel.functionalChannelType === 'BLIND_CHANNEL') {
        const shutterChannel = <ShutterChannel>channel;

        const shutterLevelHomeKit = HmIPShutter.shutterHmIPToHomeKit(shutterChannel.shutterLevel);
        if (shutterLevelHomeKit != this.shutterLevel) {
          this.shutterLevel = shutterLevelHomeKit;
          this.platform.log.info('Current shutter level of %s changed to %s', this.accessory.displayName, this.shutterLevel);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.shutterLevel);
        }

        if (shutterChannel.processing != this.processing) {
          this.processing = shutterChannel.processing;
          this.platform.log.info('Processing state of shutter/blind %s changed to %s', this.accessory.displayName, this.processing);
          this.service.updateCharacteristic(this.platform.Characteristic.PositionState,
            shutterChannel.processing ? this.platform.Characteristic.PositionState.DECREASING : this.platform.Characteristic.PositionState.STOPPED);
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
