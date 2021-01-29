import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHeatingGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface ClimateSensorChannel {
  functionalChannelType: string;
  actualTemperature: number;
  humidity: number;
  vaporAmount: number;
}

/**
 * HomematicIP Climate Sensor
 *
 * HmIP-STHO
 * HmIP-STHO-A
 * HmIP-STH
 * HMIP-STHD
 *
 */
export class HmIPClimateSensor extends HmIPGenericDevice implements Updateable {
  private temperatureService: Service;
  private humidityService: Service;

  private actualTemperature: number = 0;
  private humidity: number = 0;

  constructor(
    platform: HmIPPlatform,
    home: HmIPHome,
    accessory: PlatformAccessory,
  ) {
    super(platform, home, accessory);

    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor);
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor);
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(home, accessory.context.device, platform.groups);

    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .setProps({minValue: -100})
        .on('get', this.handleCurrentTemperatureGet.bind(this));

    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
  }

  handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.actualTemperature);
  }

  handleCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
    callback(null, this.humidity);
  }


  public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPHome, hmIPDevice, groups);
    this.home = hmIPHome;
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'CLIMATE_SENSOR_CHANNEL'
          || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL'
          || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL') {
        const climateSensorChannel = <ClimateSensorChannel>channel;

        if (climateSensorChannel.actualTemperature !== this.actualTemperature) {
          this.actualTemperature = climateSensorChannel.actualTemperature;
          this.platform.log.info(`Current temperature of ${this.accessory.displayName} changed to ${this.actualTemperature}`);
          this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.actualTemperature);
        }

        if (climateSensorChannel.humidity !== this.humidity) {
          this.humidity = climateSensorChannel.humidity;
          this.platform.log.info(`Current relative humidity of ${this.accessory.displayName} changed to ${this.humidity}`);
          this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
        }

      }
    }
  }
}
