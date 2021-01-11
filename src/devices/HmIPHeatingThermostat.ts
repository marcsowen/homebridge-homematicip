import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface HeatingThermostatChannel {
  functionalChannelType: string;
  valveActualTemperature: number;
  setPointTemperature: number;
  valvePosition: number;
  temperatureOffset: number;
  valveState: string;
  groups: string[];
}

/**
 * HomematicIP Heating Thermostat
 */
export class HmIPHeatingThermostat extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private valveActualTemperature = 0;
  private setPointTemperature = 0;
  private valvePosition = 0;
  private heatingGroupId = '';

  constructor(
    platform: HmIPPlatform,
    home: HmIPHome,
    accessory: PlatformAccessory,
  ) {
    super(platform, home, accessory);

    this.service = this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(home, accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on('get', this.handleTargetHeatingCoolingStateGet.bind(this))
      .on('set', this.handleTargetHeatingCoolingStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('get', this.handleTargetTemperatureGet.bind(this))
      .on('set', this.handleTargetTemperatureSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', this.handleTemperatureDisplayUnitsGet.bind(this))
      .on('set', this.handleTemperatureDisplayUnitsSet.bind(this));

  }

  handleCurrentHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.platform.Characteristic.CurrentHeatingCoolingState.HEAT);
  }

  handleTargetHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.platform.Characteristic.CurrentHeatingCoolingState.HEAT);
  }

  handleTargetHeatingCoolingStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    callback(null);
  }

  handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.valveActualTemperature);
  }

  handleTargetTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.setPointTemperature);
  }

  async handleTargetTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info(`Setting target temperature for ${this.accessory.displayName} to ${value}`);
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
    callback(null);
  }

  handleCurrentActuationGet(callback: CharacteristicGetCallback) {
    callback(null, this.valvePosition);
  }

  public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    this.home = hmIPHome;
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'HEATING_THERMOSTAT_CHANNEL') {
        const wthChannel = <HeatingThermostatChannel>channel;

        if (wthChannel.setPointTemperature != this.setPointTemperature) {
          this.platform.log.info(`Target temperature of ${this.accessory.displayName} changed to ${wthChannel.setPointTemperature}`);
          this.setPointTemperature = wthChannel.setPointTemperature;
          this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.setPointTemperature);
        }

        if (wthChannel.valveActualTemperature != this.valveActualTemperature) {
          this.platform.log.info(`Current temperature of ${this.accessory.displayName} changed to ${wthChannel.valveActualTemperature}`);
          this.valveActualTemperature = wthChannel.valveActualTemperature;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.valveActualTemperature);
        }

        for (const groupId of wthChannel.groups) {
          if (groups[groupId].type == 'HEATING') {
            this.heatingGroupId = groupId;
          }
        }
      }
    }
  }
}
