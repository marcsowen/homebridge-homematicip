import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

enum ValveState {
  STATE_NOT_AVAILABLE = 'STATE_NOT_AVAILABLE',
  RUN_TO_START = 'RUN_TO_START',
  WAIT_FOR_ADAPTION = 'WAIT_FOR_ADAPTION',
  ADAPTION_IN_PROGRESS = 'ADAPTION_IN_PROGRESS',
  ADAPTION_DONE = 'ADAPTION_DONE',
  TOO_TIGHT = 'TOO_TIGHT',
  ADJUSTMENT_TOO_BIG = 'ADJUSTMENT_TOO_BIG',
  ADJUSTMENT_TOO_SMALL = 'ADJUSTMENT_TOO_SMALL',
  ERROR_POSITION = 'ERROR_POSITION',
}

interface HeatingThermostatChannel {
  functionalChannelType: string;
  valveActualTemperature: number;
  setPointTemperature: number;
  valvePosition: number;
  temperatureOffset: number;
  valveState: ValveState;
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
  private valveState: ValveState = ValveState.ERROR_POSITION;
  private heatingGroupId = '';

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.service = this.accessory.getService(this.platform.Service.Thermostat)
      || this.accessory.addService(this.platform.Service.Thermostat);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on('get', this.handleTargetHeatingCoolingStateGet.bind(this))
      .on('set', this.handleTargetHeatingCoolingStateSet.bind(this))
      .setProps({
        validValues: [this.platform.Characteristic.TargetHeatingCoolingState.HEAT]
      });

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
  }

  handleCurrentHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.valvePosition > 0 ?
      this.platform.Characteristic.CurrentHeatingCoolingState.HEAT : this.platform.Characteristic.CurrentHeatingCoolingState.OFF);
  }

  handleTargetHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.platform.Characteristic.TargetHeatingCoolingState.HEAT);
  }

  handleTargetHeatingCoolingStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Ignoring setting heating/cooling state for %s to %s', this.accessory.displayName,
      this.getTargetHeatingCoolingStateName(<number>value));
    callback(null);
  }

  handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.valveActualTemperature);
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

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'HEATING_THERMOSTAT_CHANNEL') {
        const heatingThermostatChannel = <HeatingThermostatChannel>channel;

        if (heatingThermostatChannel.setPointTemperature !== this.setPointTemperature) {
          this.setPointTemperature = heatingThermostatChannel.setPointTemperature;
          this.platform.log.debug('Target temperature of %s changed to %s °C', this.accessory.displayName, this.setPointTemperature);
          this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.setPointTemperature);
        }

        if (heatingThermostatChannel.valveActualTemperature !== this.valveActualTemperature) {
          this.valveActualTemperature = heatingThermostatChannel.valveActualTemperature;
          this.platform.log.debug('Current temperature of %s changed to %s °C', this.accessory.displayName, this.valveActualTemperature);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.valveActualTemperature);
        }

        if (heatingThermostatChannel.valvePosition !== this.valvePosition) {
          this.valvePosition = heatingThermostatChannel.valvePosition;
          this.platform.log.debug('Current valve position of %s changed to %s', this.accessory.displayName, this.valvePosition);
        }

        if (heatingThermostatChannel.valveState !== this.valveState) {
          this.valveState = heatingThermostatChannel.valveState;
          this.platform.log.info('Current valve state of %s changed to %s', this.accessory.displayName, this.valveState);
        }

        for (const groupId of heatingThermostatChannel.groups) {
          if (groups[groupId].type === 'HEATING') {
            this.heatingGroupId = groupId;
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
