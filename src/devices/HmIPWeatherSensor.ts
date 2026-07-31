import type fakegato from 'fakegato-history';
import type {Service} from 'homebridge';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

enum WindValueType {
  CURRENT_VALUE = 'CURRENT_VALUE',
  MIN_VALUE = 'MIN_VALUE',
  MAX_VALUE = 'MAX_VALUE',
  AVERAGE_VALUE = 'AVERAGE_VALUE'
}

export interface WeatherSensorChannel {
  functionalChannelType: string;
  actualTemperature: number;
  humidity: number;
  illumination: number;
  illuminationThresholdSunshine: number;
  storm: boolean;
  sunshine: boolean;
  todaySunshineDuration: number;
  totalSunshineDuration: number;
  windSpeed: number;
  windValueType: WindValueType;
  yesterdaySunshineDuration: number;
  vaporAmount: number; // absolute humidity (grams per m^3)
}

/**
 * HomematicIP weather sensor
 * HMIP-SWO-B
 *
 * This device creates both regular HomeKit services that can be used in the
 * Home App, but also emulates an Eve Weather Station.
 *
 * Supported Services:
 *
 * HumiditySensor (HomeKit default)
 * - CurrentRelativeHumidity
 *
 * TemperatureSensor (HomeKit default)
 * - CurrentTemperature: $actualTemperature
 * - TemperatureDisplayUnits: CELSIUS
 *
 *  WeatherService: UUID: E863F001-079E-48FF-8F27-9C2605A29F52
 *  - WeatherConditionCategory (UUID=cd65a9ab-85ad-494a-b2bd-2f380084134c, 0=sunshine==true,
 *        1=sunshine==false&&rain==false, 2=rain==true||storm==true, 3=snow (unsupported), 4=other)
 *  - Rain24h (UUID=ccc04890-565b-4376-b39a-3113341d9e0f, todayRainCounter)
 *  - RainBool (UUID=f14eb1ad-e000-4ef4-a54f-0cf07b2e7be7)
 *  - WindSpeed (UUID=49C8AE5A-A3A5-41AB-BF1F-12D5654F9F41)
 *  - WindDirection (UUID=46F1284C-1912-421B-82F5-EB75008B167E)*

 *    "actualTemperature": 8.1
 *    "humidity": 81,
 *    "vaporAmount": 6.731837071554497,
 *    "illumination": 3435,
 *    "windSpeed": 0,
 *    "sunshine": false,
 *    "storm": false,
 *    "totalSunshineDuration": 92,
 *    "todaySunshineDuration": 2,
 *    "yesterdaySunshineDuration": 84,
 *    "illuminationThresholdSunshine": 3000,
 *    "windValueType": "CURRENT_VALUE",
 *    "raining": false,
 *    "totalRainCounter": 0.9,
 *    "todayRainCounter": 0,
 *    "yesterdayRainCounter": 0,
 *    "windDirection": 80,
 *    "windDirectionVariation": 45,
 *    "weathervaneAlignmentNeeded": false
 *
 */
export class HmIPWeatherSensor extends HmIPGenericDevice {

  // every 5 minutes
  protected readonly historyEventUpdateFrequencyMs: number = 5 * 60 * 1000;
  protected actualTemperature = 0.0;
  protected humidity = 0.0;
  protected illumination = 0.0;
  protected illuminationThresholdSunshine = 0.0;
  protected storm = false;
  protected sunshine = false;
  protected todaySunshineDuration = 0.0;
  protected totalSunshineDuration = 0.0;
  protected windSpeed = 0.0;
  protected windValueType: WindValueType = WindValueType.CURRENT_VALUE;
  protected yesterdaySunshineDuration = 0.0;
  protected vaporAmount = 0.0;
  protected lightSensorService: Service;
  protected temperatureService: Service;
  protected humidityService: Service;
  protected stormOccupancyService?: Service;
  protected sunshineOccupancyService?: Service;
  protected windSpeedOccupancyService?: Service;
  private readonly withStormSensor: boolean;
  private readonly withSunshineSensor: boolean;
  private readonly withWindSpeedSensor: boolean;
  protected weatherService?: Service;
  private historyService: typeof fakegato;
  private eventEmitterTimeout: NodeJS.Timeout | null = null;

  constructor(platform: HmIPPlatform, accessory: HmIPPlatformAccessory) {
    super(platform, accessory);

    this.withStormSensor = accessory.context.config?.withStormSensor ?? false;
    this.withSunshineSensor = accessory.context.config?.withSunshineSensor ?? false;
    this.withWindSpeedSensor = accessory.context.config?.withWindSpeedSensor ?? false;

    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor)
      || this.accessory.addService(this.platform.Service.TemperatureSensor);
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor)
      || this.accessory.addService(this.platform.Service.HumiditySensor);
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.lightSensorService = this.accessory.getService(this.platform.Service.LightSensor)
      || this.accessory.addService(this.platform.Service.LightSensor);
    this.lightSensorService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.weatherService = this.accessory.getService('WeatherService')
      || this.accessory.addService(new platform.api.hap.Service('WeatherService', 'E863F001-079E-48FF-8F27-9C2605A29F52'));

    if (this.withStormSensor) {
      this.stormOccupancyService = this.accessory.getServiceById(this.platform.Service.OccupancySensor, 'Storm')
        || this.accessory.addService(new this.platform.Service.OccupancySensor(`${accessory.context.device.label} Storm`, 'Storm'));
      this.stormOccupancyService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.context.device.label} Storm`,);
    }

    if (this.withSunshineSensor) {
      this.sunshineOccupancyService = this.accessory.getServiceById(this.platform.Service.OccupancySensor, 'Sunshine')
        || this.accessory.addService(new this.platform.Service.OccupancySensor(`${accessory.context.device.label} Sunshine`, 'Sunshine'));
      this.sunshineOccupancyService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.context.device.label} Sunshine`,);
    }

    if (this.withWindSpeedSensor) {
      this.windSpeedOccupancyService = this.accessory.getServiceById(this.platform.Service.OccupancySensor, 'WindSpeed')
        || this.accessory.addService(new this.platform.Service.OccupancySensor(`${accessory.context.device.label}  WindSpeed`, 'WindSpeed'));
      this.windSpeedOccupancyService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.context.device.label} WindSpeed`);
    }

    this.historyService = new this.platform.FakeGatoHistoryService('weather', this.accessory, {
      log: this.platform.log,
      storage: 'fs',
      path: `${this.platform.api.user.storagePath()}/accessories`,
      filename: `history_${this.accessory.context.device.id}.json`,
      length: 1000,
    });

    // update initially
    this.platform.log.debug(`Created WeatherSensor ${accessory.context.device.label}`);
    this.updateDevice(accessory.context.device, platform.groups);

    // register characteristics
    this.lightSensorService.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
      .onGet(() => this.illumination);

    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({minValue: -100})
      .onGet(() => this.actualTemperature);

    this.temperatureService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(() => this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);

    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(() => this.humidity);

    this.weatherService?.getCharacteristic(this.platform.customCharacteristic.characteristic.WindSpeed)
      .onGet(() => this.windSpeed);

    this.weatherService?.getCharacteristic(this.platform.customCharacteristic.characteristic.WeatherConditionCategory)
      .onGet(() => this.getWeatherConditionCategory());

    this.stormOccupancyService?.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .onGet(() => this.storm
        ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
        : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);

    this.sunshineOccupancyService?.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .onGet(() => this.sunshine
        ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
        : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);

    this.windSpeedOccupancyService?.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .onGet(() => this.windSpeed >= 1.852
        ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
        : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);

  }

  protected getWeatherConditionCategory(): number {
    if (this.storm) {
      return 9;
    }
    if (this.humidity >= 99) {
      return 4;
    }
    if (this.sunshine) {
      return 0;
    }
    return 3;
  }

  private startHistoryEventEmitter() {
    this.emitHistoryEvent();
    // cancel scheduled event before recreating
    if (this.eventEmitterTimeout !== null) {
      clearTimeout(this.eventEmitterTimeout);
    }
    this.eventEmitterTimeout = setTimeout(() => this.startHistoryEventEmitter(), this.historyEventUpdateFrequencyMs);
  }

  public override dispose(): void {
    if (this.eventEmitterTimeout !== null) {
      clearTimeout(this.eventEmitterTimeout);
      this.eventEmitterTimeout = null;
    }
  }

  private emitHistoryEvent() {
    const data = {
      time: Math.floor(Date.now() / 1000),
      temp: this.actualTemperature,
      pressure: 0,
      humidity: this.humidity
    };
    this.historyService.addEntry(data);
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'WEATHER_SENSOR_CHANNEL'
        || channel.functionalChannelType === 'WEATHER_SENSOR_PLUS_CHANNEL'
        || channel.functionalChannelType === 'WEATHER_SENSOR_PRO_CHANNEL') {
        const weatherSensorChannel = <WeatherSensorChannel>channel;
        this.platform.log.debug(`WeatherSensor update: ${JSON.stringify(channel)}`);

        if (weatherSensorChannel.actualTemperature !== null && weatherSensorChannel.actualTemperature !== this.actualTemperature) {
          this.actualTemperature = weatherSensorChannel.actualTemperature;
          this.platform.log.info('WeatherSensor %s changed actualTemperature=%d', this.accessory.displayName, this.actualTemperature);
          this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.actualTemperature)
        }

        if (weatherSensorChannel.humidity !== null && weatherSensorChannel.humidity !== this.humidity) {
          this.humidity = weatherSensorChannel.humidity;
          this.platform.log.info('WeatherSensor %s changed humidity=%d', this.accessory.displayName, this.humidity);
          this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity)
        }

        if (weatherSensorChannel.illumination !== null && weatherSensorChannel.illumination !== this.illumination) {
          this.illumination = weatherSensorChannel.illumination;
          this.platform.log.info('WeatherSensor %s changed illumination=%d', this.accessory.displayName, this.illumination);
          this.lightSensorService.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.illumination)
        }

        if (weatherSensorChannel.illuminationThresholdSunshine !== null && weatherSensorChannel.illuminationThresholdSunshine !== this.illuminationThresholdSunshine) {
          this.illuminationThresholdSunshine = weatherSensorChannel.illuminationThresholdSunshine;
          this.platform.log.info('WeatherSensor %s changed illuminationThresholdSunshine=%d', this.accessory.displayName, this.illuminationThresholdSunshine);
        }

        if (weatherSensorChannel.storm !== null && weatherSensorChannel.storm !== this.storm) {
          this.storm = weatherSensorChannel.storm;
          this.platform.log.info('WeatherSensor %s changed storm=%s', this.accessory.displayName, this.storm);
          this.stormOccupancyService?.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.storm
            ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
        }

        if (weatherSensorChannel.sunshine !== null && weatherSensorChannel.sunshine !== this.sunshine) {
          this.sunshine = weatherSensorChannel.sunshine;
          this.platform.log.info('WeatherSensor %s changed sunshine=%s', this.accessory.displayName, this.sunshine);
          this.sunshineOccupancyService?.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.sunshine
            ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
        }

        if (weatherSensorChannel.todaySunshineDuration !== null && weatherSensorChannel.todaySunshineDuration !== this.todaySunshineDuration) {
          this.todaySunshineDuration = weatherSensorChannel.todaySunshineDuration;
          this.platform.log.info('WeatherSensor %s changed todaySunshineDuration=%s', this.accessory.displayName, this.todaySunshineDuration);
        }

        if (weatherSensorChannel.totalSunshineDuration !== null && weatherSensorChannel.totalSunshineDuration !== this.totalSunshineDuration) {
          this.totalSunshineDuration = weatherSensorChannel.totalSunshineDuration;
          this.platform.log.info('WeatherSensor %s changed totalSunshineDuration=%s', this.accessory.displayName, this.totalSunshineDuration);
        }

        if (weatherSensorChannel.windSpeed !== null && weatherSensorChannel.windSpeed !== this.windSpeed) {
          this.windSpeed = weatherSensorChannel.windSpeed;
          this.platform.log.info('WeatherSensor %s changed windSpeed=%s', this.accessory.displayName, this.windSpeed);
          this.windSpeedOccupancyService?.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.windSpeed > 5
            ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
        }

        if (weatherSensorChannel.windValueType !== null && weatherSensorChannel.windValueType !== this.windValueType) {
          this.windValueType = weatherSensorChannel.windValueType;
          this.platform.log.info('WeatherSensor %s changed windValueType=%s', this.accessory.displayName, this.windValueType);
        }

        if (weatherSensorChannel.yesterdaySunshineDuration !== null && weatherSensorChannel.yesterdaySunshineDuration !== this.yesterdaySunshineDuration) {
          this.yesterdaySunshineDuration = weatherSensorChannel.yesterdaySunshineDuration;
          this.platform.log.info('WeatherSensor %s changed yesterdaySunshineDuration=%s', this.accessory.displayName, this.yesterdaySunshineDuration);
        }

        if (weatherSensorChannel.vaporAmount !== null && weatherSensorChannel.vaporAmount !== this.vaporAmount) {
          this.vaporAmount = weatherSensorChannel.vaporAmount;
          this.platform.log.info('WeatherSensor %s changed vaporAmount=%s', this.accessory.displayName, this.vaporAmount);
        }
      }
    }
    // start once (!) after first device update
    if (this.eventEmitterTimeout === null) {
      this.startHistoryEventEmitter();
    }
  }
}
