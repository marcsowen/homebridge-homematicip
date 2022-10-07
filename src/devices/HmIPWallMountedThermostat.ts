import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
  ServiceEventTypes,
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

interface WallMountedThermostatInternalSwitchChannel {
  functionalChannelType: string;
  valvePosition: number;
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
  private valvePosition: number | null = null;
  private minTemperature = 5;
  private maxTemperature = 30;
  private controlMode = 'UNKNOWN';
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
      .on('set', this.handleTargetHeatingCoolingStateSet.bind(this))
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeatingCoolingState.OFF,
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
          this.platform.Characteristic.TargetHeatingCoolingState.AUTO,
        ],
      });

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('get', this.handleTargetTemperatureGet.bind(this))
      .on('set', this.handleTargetTemperatureSet.bind(this))
      .setProps({
        minValue: this.minTemperature,
        maxValue: this.maxTemperature,
        minStep: 0.5,
      });

    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', this.handleTemperatureDisplayUnitsGet.bind(this))
      .on('set', this.handleTemperatureDisplayUnitsSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
  }

  handleCurrentHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.getCurrentHeatingCoolingState());
  }

  private getCurrentHeatingCoolingState() {
    const heating = this.valvePosition !== null ?
      this.valvePosition > 0 :
      this.setPointTemperature > this.actualTemperature;
    return this.cooling ?
      this.platform.Characteristic.CurrentHeatingCoolingState.COOL :
      heating ?
        this.platform.Characteristic.CurrentHeatingCoolingState.HEAT :
        this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  handleTargetHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.getTargetHeatingCoolingState());
  }

  private getTargetHeatingCoolingState(): number {
    // 'ECO' and other modes also result in `AUTO`
    // `OFF` is not a real state and is not inferred
    // `COOL` is not yet a valid state, so it results in `AUTO` for now
    return this.controlMode !== 'MANUAL' ?
      this.platform.Characteristic.TargetHeatingCoolingState.AUTO :
      this.cooling ?
        this.platform.Characteristic.TargetHeatingCoolingState.AUTO :
        this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
  }

  async handleTargetHeatingCoolingStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const stateName = this.getTargetHeatingCoolingStateName(<number>value);
    const controlMode = this.getControlModeFromTargetHeatingCoolingState(
      stateName === 'OFF' ?
        this.cooling ?
          this.platform.Characteristic.TargetHeatingCoolingState.COOL :  // results in 'UNKNOWN' for now
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT :
        <number>value,
    );
    if (controlMode === 'UNKNOWN') {
      this.platform.log.info('Ignoring setting target heating/cooling state for %s to %s', this.accessory.displayName,
        stateName);
    } else {
      this.platform.log.info('Setting target heating/cooling state for %s to %s', this.accessory.displayName, stateName);
      if (controlMode !== this.controlMode) {
        this.platform.log.info('Setting control mode for %s to %s', this.accessory.displayName, controlMode);
        const body = {
          groupId: this.heatingGroupId,
          controlMode: controlMode,
        };
        await this.platform.connector.apiCall('group/heating/setControlMode', body);
      }
      if (stateName === 'OFF') {
        const targetTemperature = this.cooling ? this.maxTemperature : this.minTemperature;
        if (targetTemperature !== this.setPointTemperature) {
          this.service.setCharacteristic(this.platform.Characteristic.TargetTemperature, targetTemperature);
        }
        // TODO ensure UI is updated inmmediatly to reflect `OFF` is not a real state
      }
    }
    callback(null);
  }

  private getControlModeFromTargetHeatingCoolingState(heatingCoolingState: number): string {
    switch (heatingCoolingState) {
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        return 'MANUAL';
      // case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
      //   return 'MANUAL';
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        return 'AUTOMATIC';
      default:
        return 'UNKNOWN';
    }
  }

  handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.actualTemperature);
  }

  handleTargetTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.setPointTemperature);
  }

  async handleTargetTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value !== this.setPointTemperature) {
      this.platform.log.info('Setting target temperature for %s to %s °C', this.accessory.displayName, value);
      const body = {
        groupId: this.heatingGroupId,
        setPointTemperature: value,
      };
      await this.platform.connector.apiCall('group/heating/setSetPointTemperature', body);
    }
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
              this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState,
                this.getCurrentHeatingCoolingState());
            }

            let emitServiceConfigurationChange = false;

            if (heatingGroup.minTemperature !== null && heatingGroup.minTemperature !== this.minTemperature) {
              this.minTemperature = heatingGroup.minTemperature;
              this.platform.log.info('Min temperature of %s changed to %s', this.accessory.displayName, this.minTemperature);
              this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
                .setProps({
                  minValue: this.minTemperature,
                });
              emitServiceConfigurationChange = true;
            }

            if (heatingGroup.maxTemperature !== null && heatingGroup.maxTemperature !== this.maxTemperature) {
              this.maxTemperature = heatingGroup.maxTemperature;
              this.platform.log.info('Max temperature of %s changed to %s', this.accessory.displayName, this.maxTemperature);
              this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
                .setProps({
                  maxValue: this.maxTemperature,
                });
              emitServiceConfigurationChange = true;
            }

            // Inferring target heating/cooling state depends on current state (e.g. cooling), so process it last
            if (heatingGroup.controlMode !== null && heatingGroup.controlMode !== this.controlMode) {
              this.controlMode = heatingGroup.controlMode;
              this.platform.log.info('Control mode of %s changed to %s', this.accessory.displayName, this.controlMode);
              this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState,
                this.getTargetHeatingCoolingState());
            }

            if (emitServiceConfigurationChange) {
              // `setProps` does not yet increase the configuration number so
              // we emit a service change here. Maybe there is a better way...
              this.service.emit(ServiceEventTypes.SERVICE_CONFIGURATION_CHANGE);
              this.platform.log.info('Emitted service configuration change of %s', this.accessory.displayName);
            }
          }
        }
      } else if (channel.functionalChannelType === 'INTERNAL_SWITCH_CHANNEL') {
        const wthsChannel = <WallMountedThermostatInternalSwitchChannel>channel;

        if (wthsChannel.valvePosition !== null && wthsChannel.valvePosition !== this.valvePosition) {
          this.valvePosition = wthsChannel.valvePosition;
          this.platform.log.info('Valve position of %s changed to %s', this.accessory.displayName, this.valvePosition);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.getCurrentHeatingCoolingState());
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
