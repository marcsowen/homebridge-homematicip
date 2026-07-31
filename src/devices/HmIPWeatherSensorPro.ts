import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPWeatherSensorPlus, type WeatherSensorPlusChannel} from './HmIPWeatherSensorPlus.js';

export interface WeatherSensorProChannel extends WeatherSensorPlusChannel {
  weathervaneAlignmentNeeded: boolean;
  windDirection: number;
  windDirectionVariation: number;
}

/**
 * HomematicIP weather sensor pro
 *
 * HMIP-SWO-PR
 */
export class HmIPWeatherSensorPro extends HmIPWeatherSensorPlus {

  protected weathervaneAlignmentNeeded = false;
  protected windDirection = 0.0;
  protected windDirectionVariation = 0.0;

  constructor(platform: HmIPPlatform, accessory: HmIPPlatformAccessory) {
    super(platform, accessory);

    this.platform.log.debug(`Created WeatherSensorPro ${accessory.context.device.label}`);
    this.updateDevice(accessory.context.device, platform.groups);

    this.weatherService?.getCharacteristic(this.platform.customCharacteristic.characteristic.WindDirection)
      .onGet(() => `${this.windDirection}°`);
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'WEATHER_SENSOR_PRO_CHANNEL') {
        const weatherSensorChannel = <WeatherSensorProChannel>channel;
        this.platform.log.debug(`WeatherSensorProChannel update: ${JSON.stringify(channel)}`);

        if (weatherSensorChannel.weathervaneAlignmentNeeded !== null && weatherSensorChannel.weathervaneAlignmentNeeded !== this.weathervaneAlignmentNeeded) {
          this.weathervaneAlignmentNeeded = weatherSensorChannel.weathervaneAlignmentNeeded;
          this.platform.log.info('WeatherSensor %s changed weathervaneAlignmentNeeded=%s', this.accessory.displayName, this.weathervaneAlignmentNeeded);
        }

        if (weatherSensorChannel.windDirection !== null && weatherSensorChannel.windDirection !== this.windDirection) {
          this.windDirection = weatherSensorChannel.windDirection;
          this.platform.log.info('WeatherSensor %s changed windDirection=%s', this.accessory.displayName, this.windDirection);
          this.weatherService?.updateCharacteristic(this.platform.customCharacteristic.characteristic.WindDirection, `${this.windDirection}°`);
        }

        if (weatherSensorChannel.windDirectionVariation !== null && weatherSensorChannel.windDirectionVariation !== this.windDirectionVariation) {
          this.windDirectionVariation = weatherSensorChannel.windDirectionVariation;
          this.platform.log.info('WeatherSensor %s changed windDirectionVariation=%s', this.accessory.displayName, this.windDirectionVariation);
        }
      }
    }
  }
}
