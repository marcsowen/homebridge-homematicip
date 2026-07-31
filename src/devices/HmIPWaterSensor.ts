import type {Service} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface WaterSensorChannel {
    functionalChannelType: string;
    moistureDetected: boolean;
    waterlevelDetected: boolean;
}

/**
 * HomematicIP water sensor
 *
 * HmIP-SWD
 */
export class HmIPWaterSensor extends HmIPGenericDevice {
  private waterLevelService: Service;

  private moistureDetected = false;
  private waterlevelDetected = false;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created water sensor ${accessory.context.device.label}`);

    this.waterLevelService = this.accessory.getService(this.platform.Service.LeakSensor)
      || this.accessory.addService(this.platform.Service.LeakSensor);
    this.waterLevelService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.waterLevelService.getCharacteristic(this.platform.Characteristic.LeakDetected)
      .onGet(() => this.waterlevelDetected
        ? this.platform.Characteristic.LeakDetected.LEAK_DETECTED
        : this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);

    this.updateDevice(accessory.context.device, platform.groups);
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'WATER_SENSOR_CHANNEL') {
        const waterSensorChannel = <WaterSensorChannel>channel;
        this.platform.log.debug(`Water sensor update: ${JSON.stringify(channel)}`);

        if (waterSensorChannel.moistureDetected !== null && waterSensorChannel.moistureDetected !== this.moistureDetected) {
          this.moistureDetected = waterSensorChannel.moistureDetected;
          this.platform.log.info('Water sensor moisture detection of %s changed to %s', this.accessory.displayName, this.moistureDetected);
        }

        if (waterSensorChannel.waterlevelDetected !== null && waterSensorChannel.waterlevelDetected !== this.waterlevelDetected) {
          this.waterlevelDetected = waterSensorChannel.waterlevelDetected;
          this.platform.log.info('Water sensor water level detection of %s changed to %s',
            this.accessory.displayName, this.waterlevelDetected);
          this.waterLevelService.updateCharacteristic(this.platform.Characteristic.LeakDetected,
            this.waterlevelDetected
              ? this.platform.Characteristic.LeakDetected.LEAK_DETECTED
              : this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
        }

      }
    }
  }
}
