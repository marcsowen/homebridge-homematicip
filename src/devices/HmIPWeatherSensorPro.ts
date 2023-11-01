import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState.js';
import {HmIPPlatform} from '../HmIPPlatform.js';
import {CharacteristicGetCallback, PlatformAccessory} from 'homebridge';
import {HmIPWeatherSensorPlus, WeatherSensorPlusChannel} from './HmIPWeatherSensorPlus.js';

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
export class HmIPWeatherSensorPro extends HmIPWeatherSensorPlus implements Updateable {

  protected weathervaneAlignmentNeeded = false;
  protected windDirection = 0.0;
  protected windDirectionVariation = 0.0;

  constructor(platform: HmIPPlatform, accessory: PlatformAccessory) {
    super(platform, accessory);

    this.platform.log.debug(`Created WeatherSensorPro ${accessory.context.device.label}`);
    this.updateDevice(accessory.context.device, platform.groups);

    this.weatherService?.getCharacteristic(this.platform.customCharacteristic.characteristic.WindDirection)
      .on('get', this.handleGetWindDirection.bind(this));
  }

  handleGetWindDirection(callback: CharacteristicGetCallback) {
    callback(null, this.windDirection + '°');
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
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
          this.weatherService?.updateCharacteristic(this.platform.customCharacteristic.characteristic.WindDirection, this.windDirection + '°');
        }

        if (weatherSensorChannel.windDirectionVariation !== null && weatherSensorChannel.windDirectionVariation !== this.windDirectionVariation) {
          this.windDirectionVariation = weatherSensorChannel.windDirectionVariation;
          this.platform.log.info('WeatherSensor %s changed windDirectionVariation=%s', this.accessory.displayName, this.windDirectionVariation);
        }
      }
    }
  }
}
