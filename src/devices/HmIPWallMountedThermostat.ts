import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import moment from 'moment';

import { HmIPPlatform } from '../HmIPPlatform';
import { HmIPDevice, HmIPGroup, HmIPHeatingGroup, Updateable } from '../HmIPState';
import { HmIPGenericDevice } from './HmIPGenericDevice';

interface WallMountedThermostatChannel {
  functionalChannelType: string;
  actualTemperature: number;
  setPointTemperature: number;
  humidity: number;
  groups: string[];
}

/**
 * HomematicIP Thermostat
 *
 * HmIP-WTH
 * HmIP-WTH-2
 * HMIP-WTH-B
 * HmIP-BWTH
 * HmIP-STH
 * HmIP-STHD
 * ALPHA-IP-RBG
 *
 */
export class HmIPWallMountedThermostat extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private actualTemperature = 0;
  private setPointTemperature = 0;
  private humidity = 0;
  private heatingGroupId = '';
  private cooling = false;
  private readonly historyService;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.historyService = new this.platform.FakeGatoHistoryService('weather', this.accessory, {
      log: this.platform.log,
      storage: 'fs',
      path: this.platform.api.user.storagePath() + '/accessories',
      filename: 'history_' + this.accessory.context.device.id + '.json',
      length: 1000,
    });

    this.service = this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on('get', this.handleTargetHeatingCoolingStateGet.bind(this))
      .on('set', this.handleTargetHeatingCoolingStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('get', this.handleTargetTemperatureGet.bind(this))
      .on('set', this.handleTargetTemperatureSet.bind(this))
      .setProps({
        minValue: 5,
        maxValue: 30,
        minStep: 0.5,
      });

    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', this.handleTemperatureDisplayUnitsGet.bind(this))
      .on('set', this.handleTemperatureDisplayUnitsSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
  }

  handleCurrentHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.getHeatingCoolongState());
  }

  private getHeatingCoolongState() {
    return this.cooling ?
      this.platform.Characteristic.CurrentHeatingCoolingState.COOL :
      this.setPointTemperature > this.actualTemperature ?
        this.platform.Characteristic.CurrentHeatingCoolingState.HEAT :
        this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  handleTargetHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.platform.Characteristic.TargetHeatingCoolingState.AUTO);
  }

  handleTargetHeatingCoolingStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Ignoring setting heating/cooling state for %s to %s', this.accessory.displayName,
      this.getTargetHeatingCoolingStateName(<number>value));
    callback(null);
  }

  handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.actualTemperature);
  }

  handleTargetTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.setPointTemperature);
  }

  async handleTargetTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting target temperature for %s to %s °C', this.accessory.displayName, value);
    const body = {
      groupId: this.heatingGroupId,
      setPointTemperature: value,
    };
    await this.platform.connector.apiCall('group/heating/setSetPointTemperature', body);
    callback(null);
  }

  handleTemperatureDisplayUnitsGet(callback: CharacteristicGetCallback) {
    callback(null, this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
  }

  handleTemperatureDisplayUnitsSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Ignoring setting display units for %s to %s', this.accessory.displayName,
      value === 0 ? 'CELSIUS' : 'FAHRENHEIT');
    callback(null);
  }

  handleCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
    callback(null, this.humidity);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL'
        || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL') {
        const wthChannel = <WallMountedThermostatChannel>channel;

        if (wthChannel.setPointTemperature !== null && wthChannel.setPointTemperature !== this.setPointTemperature) {
          this.setPointTemperature = wthChannel.setPointTemperature;
          this.platform.log.info('Target temperature of %s changed to %s °C (device channel)',
            this.accessory.displayName, this.setPointTemperature);
          this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.setPointTemperature);
        }

        if (wthChannel.actualTemperature !== null && wthChannel.actualTemperature !== this.actualTemperature) {
          this.actualTemperature = wthChannel.actualTemperature;
          this.platform.log.debug('Current temperature of %s changed to %s °C', this.accessory.displayName, this.actualTemperature);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.actualTemperature);
        }

        if (wthChannel.humidity !== null && wthChannel.humidity !== this.humidity) {
          this.humidity = wthChannel.humidity;
          this.platform.log.debug('Current relative humidity of %s changed to %s %%', this.accessory.displayName, this.humidity);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
        }

        this.historyService.addEntry({ time: moment().unix(), temp: this.actualTemperature, pressure: 0, humidity: this.humidity });

        for (const groupId of wthChannel.groups) {
          if (groups[groupId].type === 'HEATING') {
            this.heatingGroupId = groupId;
            const heatingGroup = <HmIPHeatingGroup>groups[groupId];

            if (wthChannel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL'
              && heatingGroup.setPointTemperature !== null
              && heatingGroup.setPointTemperature !== this.setPointTemperature) {
              this.setPointTemperature = heatingGroup.setPointTemperature;
              this.platform.log.info('Target temperature of %s changed to %s °C (heating group)',
                this.accessory.displayName, this.setPointTemperature);
              this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.setPointTemperature);
            }

            if (heatingGroup.cooling !== null && heatingGroup.cooling !== this.cooling) {
              this.cooling = heatingGroup.cooling;
              this.platform.log.info('Cooling mode of %s changed to %s', this.accessory.displayName, this.cooling);
              this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.getHeatingCoolongState());
            }
          }
        }
      }
    }
  }

  private getTargetHeatingCoolingStateName(heatingCoolingState: number): string {
    switch (heatingCoolingState) {
      case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
        return 'OFF';
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        return 'HEAT';
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
        return 'COOL';
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        return 'AUTO';
      default:
        return 'UNKNOWN';
    }
  }
}
