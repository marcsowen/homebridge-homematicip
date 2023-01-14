import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
  ServiceEventTypes,
} from 'homebridge';
import moment from 'moment';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHeatingGroup, Updateable} from '../HmIPState';
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

interface ThermostatChannel {
  functionalChannelType: string;
  setPointTemperature: number;
  groups: string[];
}

interface WallMountedThermostatChannel extends ThermostatChannel {
  actualTemperature: number;
  humidity: number;
}

interface HeatingThermostatChannel extends ThermostatChannel {
  valveActualTemperature: number;
  valvePosition: number;
  temperatureOffset: number;
  valveState: ValveState;
}

interface WallMountedThermostatInternalSwitchChannel {
  functionalChannelType: string;
  valvePosition: number;
}

interface HistoryEvent {
  time: number;
  temp?: number;
  currentTemp?: number;
  humidity?: number;
  setTemp: number;
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
export class HmIPHeatingThermostat extends HmIPGenericDevice implements Updateable {

  // every 5 minutes
  private readonly historyEventUpdateFrequencyMs: number = 5 * 60 * 1000;
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
  private isWallThermostat = false;

  private valveState: ValveState = ValveState.ERROR_POSITION;
  private readonly historyService;
  private eventEmitterTimeout: NodeJS.Timeout | null = null;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.initFeatures(accessory.context.device);

    const historyType = this.isWallThermostat ? 'custom' : 'thermo';
    this.historyService = new this.platform.FakeGatoHistoryService(historyType, this.accessory, {
      log: this.platform.log,
      storage: 'fs',
      path: this.platform.api.user.storagePath() + '/accessories',
      filename: 'history_' + this.accessory.context.device.id + '.json',
      length: 1000,
    });

    this.service = this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat);
    this.service.addOptionalCharacteristic(this.platform.customCharacteristic.characteristic.ValvePosition);
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

    // this is not relevant for pure heating thermostats
    if (this.isWallThermostat) {
      this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
    }

    this.service.getCharacteristic(this.platform.customCharacteristic.characteristic.ValvePosition)
      .on('get', this.handleValvePositionGet.bind(this));

  }

  initFeatures(device: HmIPDevice) {
    this.isWallThermostat = !HmIPHeatingThermostat.isHeatingThermostat(device.type);
  }

  handleCurrentHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.getCurrentHeatingCoolingState());
  }

  handleValvePositionGet(callback: CharacteristicGetCallback) {
    callback(null, this.getCurrentValvePositionAsInt());
  }

  private getCurrentHeatingCoolingState() {
    const heating = this.valvePosition !== null ? this.valvePosition > 0 : this.setPointTemperature > this.actualTemperature;
    return this.cooling ? this.platform.Characteristic.CurrentHeatingCoolingState.COOL
      : heating ? this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
        : this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
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
      if (value !== this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).value) {
        this.platform.log.info('Setting target heating/cooling state for %s to %s', this.accessory.displayName, stateName);
      }
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
        // TODO ensure UI is updated immediately to reflect `OFF` is not a real state
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

    // attempt to read valve position first
    if (this.isWallThermostat) {
      for (const id in hmIPDevice.functionalChannels) {
        const channel = hmIPDevice.functionalChannels[id];
        if (channel.functionalChannelType === 'INTERNAL_SWITCH_CHANNEL') {
          // this.platform.log.debug('internalSwitchChannel', JSON.stringify(channel));
          const wthsChannel = <WallMountedThermostatInternalSwitchChannel>channel;
          this.updateValvePosition(wthsChannel.valvePosition, 'internalSwitchChannel');
        }
      }
    }

    // iterate over other channels
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];

      if (channel.functionalChannelType === 'HEATING_THERMOSTAT_CHANNEL'
        || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL'
        || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL') {

        const genericChannel = <ThermostatChannel>channel;

        for (const groupId of genericChannel.groups) {
          if (groups[groupId].type === 'HEATING') {
            this.heatingGroupId = groupId;
            const heatingGroup = <HmIPHeatingGroup>groups[groupId];

            // in case no display channel: set target temperature to set point temperate from heating group
            if (channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL') {
              this.updateSetPointTemperature(heatingGroup.setPointTemperature, 'heating group');
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

            // fallback if without internal switch channel: calculate average valve position by iterating heating group
            if (this.isWallThermostat) {
              this.updateValvePosition(heatingGroup.valvePosition, 'group');
            }
          }
        }
      }

      if (channel.functionalChannelType === 'HEATING_THERMOSTAT_CHANNEL') {
        const hthChannel = <HeatingThermostatChannel>channel;
        this.updateSetPointTemperature(hthChannel.setPointTemperature, 'device channel');
        this.updateActualTemperature(hthChannel.valveActualTemperature);
        this.updateValvePosition(hthChannel.valvePosition, 'device channel');
        this.updateValveState(hthChannel.valveState);
      } else if (channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL'
        || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL') {
        const wthChannel = <WallMountedThermostatChannel>channel;
        this.updateSetPointTemperature(wthChannel.setPointTemperature, 'device channel');
        this.updateActualTemperature(wthChannel.actualTemperature);
        this.updateHumidity(wthChannel.humidity);
      }
    }

    // start once after first device update
    if (this.eventEmitterTimeout === null) {
      this.startHistoryEventEmitter();
    }
  }

  private startHistoryEventEmitter() {
    this.emitHistoryEvent();
    // cancel scheduled event before recreating
    if (this.eventEmitterTimeout !== null) {
      clearTimeout(this.eventEmitterTimeout);
    }
    this.eventEmitterTimeout = setTimeout(() => this.startHistoryEventEmitter(), this.historyEventUpdateFrequencyMs);
  }

  private emitHistoryEvent() {
    const event = this.createHistoryEntry();
    this.platform.log.debug('Emitting history event', this.accessory.displayName, event);
    this.historyService.addEntry(event);
  }

  private createHistoryEntry(): HistoryEvent {
    const event: HistoryEvent = {
      time: moment().unix(),
      setTemp: this.setPointTemperature,
      valvePosition: this.getCurrentValvePositionAsInt(),
    };
    if (this.isWallThermostat) {
      event.humidity = this.humidity;
      event.temp = this.actualTemperature;
    } else {
      event.currentTemp = this.actualTemperature;
    }
    return event;
  }

  private updateValveState(updateValveState: ValveState) {
    if (updateValveState !== this.valveState) {
      this.valveState = updateValveState;
      this.platform.log.info('Current valve state of %s changed to %s', this.accessory.displayName, this.valveState);
    }
  }

  private updateActualTemperature(updatedActualTemperatue: number) {
    if (updatedActualTemperatue !== null && updatedActualTemperatue !== this.actualTemperature) {
      this.actualTemperature = updatedActualTemperatue;
      this.platform.log.debug('Current temperature of %s changed to %s °C', this.accessory.displayName, this.actualTemperature);
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.actualTemperature);
    }
  }

  private updateSetPointTemperature(updatedSetPointTemperature: number, source: string) {
    if (updatedSetPointTemperature !== null && updatedSetPointTemperature !== this.setPointTemperature) {
      this.setPointTemperature = updatedSetPointTemperature;
      this.platform.log.info('Target temperature of %s changed to %s °C (%s)',
        this.accessory.displayName, this.setPointTemperature, source);
      this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.setPointTemperature);
    }
  }

  private updateValvePosition(updateValvePosition: number, source: string) {
    if (updateValvePosition !== null && updateValvePosition !== this.valvePosition) {
      this.valvePosition = updateValvePosition;
      this.platform.log.info('Valve position of %s changed to %s (%s)',
        this.accessory.displayName, this.valvePosition, source);
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState,
        this.getCurrentHeatingCoolingState());
      this.service.updateCharacteristic(this.platform.customCharacteristic.characteristic.ValvePosition,
        this.getCurrentValvePositionAsInt());
    }
  }

  private updateHumidity(updatedHumidity: number) {
    if (updatedHumidity !== null && updatedHumidity !== this.humidity) {
      this.humidity = updatedHumidity;
      this.platform.log.debug('Current relative humidity of %s changed to %s %%', this.accessory.displayName, this.humidity);
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
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

  private getCurrentValvePositionAsInt() {
    if (this.valvePosition === null) {
      return 0;
    }
    return Math.round(this.valvePosition * 100);
  }


  public static isThermostat(deviceType: string): boolean {
    return deviceType === 'WALL_MOUNTED_THERMOSTAT_PRO'
      || deviceType === 'BRAND_WALL_MOUNTED_THERMOSTAT'
      || deviceType === 'ROOM_CONTROL_DEVICE'
      || deviceType === 'TEMPERATURE_HUMIDITY_SENSOR'
      || deviceType === 'TEMPERATURE_HUMIDITY_SENSOR_DISPLAY'
      || deviceType === 'WALL_MOUNTED_THERMOSTAT_BASIC_HUMIDITY'
      || this.isHeatingThermostat(deviceType);
  }

  public static isHeatingThermostat(deviceType: string): boolean {
    return deviceType === 'HEATING_THERMOSTAT'
      || deviceType === 'HEATING_THERMOSTAT_COMPACT'
      || deviceType === 'HEATING_THERMOSTAT_EVO';
  }

}
