import type {Service} from 'homebridge';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPWeatherSensor, type WeatherSensorChannel} from './HmIPWeatherSensor.js';

export interface WeatherSensorPlusChannel extends WeatherSensorChannel {
  raining: boolean;
  todayRainCounter: number;
  totalRainCounter: number;
  yesterdayRainCounter: number;
}

/**
 * HomematicIP weather sensor plus
 *
 * HMIP-SWO-PL
 */
export class HmIPWeatherSensorPlus extends HmIPWeatherSensor {

  protected raining = false;
  protected todayRainCounter = 0.0;
  protected totalRainCounter = 0.0;
  protected yesterdayRainCounter = 0.0;
  private rainingOccupancyService?: Service;
  private withRainSensor = false;

  constructor(platform: HmIPPlatform, accessory: HmIPPlatformAccessory) {
    super(platform, accessory);

    this.withRainSensor = accessory.context.config?.withRainSensor ?? false;

    if (this.withRainSensor) {
      this.rainingOccupancyService = this.accessory.getServiceById(this.platform.Service.OccupancySensor, 'Rain')
        || this.accessory.addService(new this.platform.Service.OccupancySensor(`${accessory.context.device.label} Rain`, 'Rain'));
      this.rainingOccupancyService.setCharacteristic(this.platform.Characteristic.Name, 'Rain');
    }

    this.platform.log.debug(`Created WeatherSensorPlus ${accessory.context.device.label}`);
    this.updateDevice(accessory.context.device, platform.groups);

    this.rainingOccupancyService?.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .onGet(() => this.raining ? 1 : 0);

    this.weatherService?.getCharacteristic(this.platform.customCharacteristic.characteristic.RainBool)
      .onGet(() => this.raining);

    this.weatherService?.getCharacteristic(this.platform.customCharacteristic.characteristic.RainDay)
      .onGet(() => this.todayRainCounter);

  }

  protected override getWeatherConditionCategory(): number {
    if (this.storm) {
      return 9;
    }
    if (this.humidity >= 99) {
      return 4;
    }
    if (this.sunshine) {
      return 0;
    }
    if (this.raining) {
      return this.todayRainCounter > 30 ? 6 : 5;
    }
    return 3;
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'WEATHER_SENSOR_PLUS_CHANNEL'
        || channel.functionalChannelType === 'WEATHER_SENSOR_PRO_CHANNEL') {
        const weatherSensorChannel = <WeatherSensorPlusChannel>channel;
        this.platform.log.debug(`WeatherSensorPlus update: ${JSON.stringify(channel)}`);

        if (weatherSensorChannel.raining !== null && weatherSensorChannel.raining !== this.raining) {
          this.raining = weatherSensorChannel.raining;
          this.platform.log.info('WeatherSensor %s changed raining=%s', this.accessory.displayName, this.raining);
          this.rainingOccupancyService?.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.raining
            ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
        }

        if (weatherSensorChannel.todayRainCounter !== null && weatherSensorChannel.todayRainCounter !== this.todayRainCounter) {
          this.todayRainCounter = weatherSensorChannel.todayRainCounter;
          this.platform.log.info('WeatherSensor %s changed todayRainCounter=%s', this.accessory.displayName, this.todayRainCounter);
        }

        if (weatherSensorChannel.totalRainCounter !== null && weatherSensorChannel.totalRainCounter !== this.totalRainCounter) {
          this.totalRainCounter = weatherSensorChannel.totalRainCounter;
          this.platform.log.info('WeatherSensor %s changed totalRainCounter=%s', this.accessory.displayName, this.totalRainCounter);
        }

        if (weatherSensorChannel.yesterdayRainCounter !== null && weatherSensorChannel.yesterdayRainCounter !== this.yesterdayRainCounter) {
          this.yesterdayRainCounter = weatherSensorChannel.yesterdayRainCounter;
          this.platform.log.info('WeatherSensor %s changed yesterdayRainCounter=%s', this.accessory.displayName, this.yesterdayRainCounter);
        }
      }
    }
  }
}
