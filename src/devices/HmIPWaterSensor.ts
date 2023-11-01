import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform.js';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState.js';
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
export class HmIPWaterSensor extends HmIPGenericDevice implements Updateable {
  private waterLevelService: Service;

  private moistureDetected = false;
  private waterlevelDetected = false;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created water sensor ${accessory.context.device.label}`);

    this.waterLevelService = this.accessory.getService(this.platform.Service.LeakSensor)
      || this.accessory.addService(this.platform.Service.LeakSensor);
    this.waterLevelService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.waterLevelService.getCharacteristic(this.platform.Characteristic.LeakDetected)
      .on('get', this.handleWaterLevelDetectedGet.bind(this));

    this.updateDevice(accessory.context.device, platform.groups);
  }

  handleWaterLevelDetectedGet(callback: CharacteristicGetCallback) {
    callback(null, this.waterlevelDetected
      ? this.platform.Characteristic.LeakDetected.LEAK_DETECTED
      : this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
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
