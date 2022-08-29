import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
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
 *
 */
export class HmIPClimateSensor extends HmIPGenericDevice implements Updateable {
  private temperatureService: Service;
  private humidityService: Service;

  private actualTemperature = 0;
  private humidity = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor)
      || this.accessory.addService(this.platform.Service.TemperatureSensor);
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor)
      || this.accessory.addService(this.platform.Service.HumiditySensor);
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(accessory.context.device, platform.groups);

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


  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'CLIMATE_SENSOR_CHANNEL' 
          || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL'
          || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL') {
        const climateSensorChannel = <ClimateSensorChannel>channel;

        if (climateSensorChannel.actualTemperature !== this.actualTemperature) {
          this.actualTemperature = climateSensorChannel.actualTemperature;
          this.platform.log.debug('Current temperature of %s changed to %s °C', this.accessory.displayName, this.actualTemperature);
          this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.actualTemperature);
        }

        if (climateSensorChannel.humidity !== this.humidity) {
          this.humidity = climateSensorChannel.humidity;
          this.platform.log.debug('Current relative humidity of %s changed to %s %%', this.accessory.displayName, this.humidity);
          this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
        }

      }
    }
  }
}
