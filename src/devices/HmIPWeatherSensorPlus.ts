import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
import {HmIPPlatform} from '../HmIPPlatform';
import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';
import {HmIPWeatherSensor, WeatherSensorChannel} from './HmIPWeatherSensor';

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
export class HmIPWeatherSensorPlus extends HmIPWeatherSensor implements Updateable {

  protected raining = false;
  protected todayRainCounter = 0.0;
  protected totalRainCounter = 0.0;
  protected yesterdayRainCounter = 0.0;
  private rainingOccupancyService?: Service;
  private withRainSensor = false;

  constructor(platform: HmIPPlatform, accessory: PlatformAccessory) {
    super(platform, accessory);

    this.withRainSensor = accessory.context.config && accessory.context.config.withRainSensor;

    if (this.withRainSensor) {
      this.rainingOccupancyService = this.accessory.getServiceById(this.platform.Service.OccupancySensor, 'Rain')
        || this.accessory.addService(new this.platform.Service.OccupancySensor(accessory.context.device.label + ' Rain', 'Rain'));
      this.rainingOccupancyService.setCharacteristic(this.platform.Characteristic.Name, 'Rain');
    }

    this.platform.log.debug(`Created WeatherSensorPlus ${accessory.context.device.label}`);
    this.updateDevice(accessory.context.device, platform.groups);

    this.rainingOccupancyService?.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .on('get', this.handleGetRaining.bind(this));

    this.weatherService?.getCharacteristic(this.platform.customCharacteristic.characteristic.RainBool)
      .on('get', this.handleGetRainingBool.bind(this));

    this.weatherService?.getCharacteristic(this.platform.customCharacteristic.characteristic.RainDay)
      .on('get', this.handleGetTodayRainCounter.bind(this));

  }

  handleGetRainingBool(callback: CharacteristicGetCallback) {
    callback(null, this.raining);
  }

  handleGetRaining(callback: CharacteristicGetCallback) {
    callback(null, this.raining ? 1 : 0);
  }

  handleGetTodayRainCounter(callback: CharacteristicGetCallback) {
    callback(null, this.todayRainCounter);
  }

  protected handleGetWeatherConditionCategory(callback: CharacteristicGetCallback) {
    if (this.storm) {
      callback(null, 9);
    } else if (this.humidity >= 99) {
      callback(null, 4);
    } else if (this.sunshine) {
      callback(null, 0);
    } else if (this.raining) {
      if (this.todayRainCounter > 30) {
        callback(null, 6);
      } else {
        callback(null, 5);
      }
    } else {
      callback(null, 3);
    }
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
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
