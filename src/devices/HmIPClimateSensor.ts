import type {Service} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

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
export class HmIPClimateSensor extends HmIPGenericDevice {
  private temperatureService: Service;
  private humidityService: Service;

  private actualTemperature = 0;
  private humidity = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.temperatureService = this.getOrAddService(
      this.platform.Service.TemperatureSensor,
      accessory.context.device.label,
    );

    this.humidityService = this.getOrAddService(
      this.platform.Service.HumiditySensor,
      accessory.context.device.label,
    );

    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({minValue: -100})
      .onGet(() => this.actualTemperature);

    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(() => this.humidity);
  }


  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
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
