import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform.js';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState.js';
import {HmIPShutter} from './HmIPShutter.js';

interface BlindChannel {
  functionalChannelType: string;
  shutterLevel: number; // 0.0 = open, 1.0 = closed
  slatsLevel: number; // 0.0 = open, 1.0 = closed
  blindModeActive: boolean;
  processing: boolean;
}

/**
 * HomematicIP blind
 *
 * HmIP-FBL (Blind Actuator - flush-mount)
 * HmIP-BBL (Blind Actuator - brand-mount)
 *
 */
export class HmIPBlind extends HmIPShutter implements Updateable {

  // Values are HomeKit style (-90..+90)
  private slatsLevel = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHorizontalTiltAngle)
      .on('get', this.handleCurrentHorizontalTiltAngleGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle)
      .on('get', this.handleTargetHorizontalTiltAngleGet.bind(this))
      .on('set', this.handleTargetHorizontalTiltAngleSet.bind(this));
  }

  handleCurrentHorizontalTiltAngleGet(callback: CharacteristicGetCallback) {
    callback(null, this.slatsLevel);
  }

  handleTargetHorizontalTiltAngleGet(callback: CharacteristicGetCallback) {
    callback(null, this.slatsLevel);
  }

  async handleTargetHorizontalTiltAngleSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting target horizontal slats position for %s to %s°', this.accessory.displayName, value);
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      shutterLevel: HmIPShutter.shutterHomeKitToHmIP(this.shutterLevel),
      slatsLevel: HmIPBlind.slatsHomeKitToHmIP(<number>value),
    };
    await this.platform.connector.apiCall('device/control/setSlatsLevel', body);
    callback(null);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'BLIND_CHANNEL') {
        const blindChannel = <BlindChannel>channel;

        const slatsLevelHomeKit = HmIPBlind.slatsHmIPToHomeKit(blindChannel.slatsLevel);
        if (slatsLevelHomeKit !== this.slatsLevel) {
          this.slatsLevel = slatsLevelHomeKit;
          this.platform.log.debug('Current blind slats level of %s changed to %s°', this.accessory.displayName, this.slatsLevel.toFixed(0));
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentHorizontalTiltAngle, this.slatsLevel);
          this.service.updateCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle, this.slatsLevel);
        }
      }
    }
  }

  private static slatsHmIPToHomeKit(hmIPValue: number): number {
    return -90 + (hmIPValue * 180.0);
  }

  private static slatsHomeKitToHmIP(homeKitValue: number): number {
    return (homeKitValue + 90) / 180.0;
  }
}
