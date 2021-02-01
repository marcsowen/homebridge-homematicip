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
  private shutterLevel = 0;
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
    this.platform.log.info(`Setting target window covering position for ${this.accessory.displayName} to ${value}`);
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      shutterLevel: HmIPShutter.homeKitToHmIP(<number>value),
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
    this.platform.log.info(`Setting window covering hold position for ${this.accessory.displayName} to ${value}`);
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

        const shutterLevelHomeKit = HmIPShutter.hmIPToHomeKit(shutterChannel.shutterLevel);
        if (shutterLevelHomeKit != this.shutterLevel) {
          this.platform.log.info(`Current shutter level of ${this.accessory.displayName} changed to ${shutterLevelHomeKit}`);
          this.shutterLevel = shutterLevelHomeKit;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, shutterLevelHomeKit);
        }

        if (shutterChannel.processing != this.processing) {
          this.platform.log.info(`Processing state of shutter/blind ${this.accessory.displayName} changed to ${shutterChannel.processing}`);
          this.processing = shutterChannel.processing;
          this.service.updateCharacteristic(this.platform.Characteristic.PositionState,
            shutterChannel.processing ? this.platform.Characteristic.PositionState.DECREASING : this.platform.Characteristic.PositionState.STOPPED);
        }
      }
    }
  }

  private static hmIPToHomeKit(hmIPValue: number): number {
    return (1 - hmIPValue) * 100.0;
  }

  private static homeKitToHmIP(homeKitValue: number): number {
    return (100 - homeKitValue) / 100.0;
  }
}
