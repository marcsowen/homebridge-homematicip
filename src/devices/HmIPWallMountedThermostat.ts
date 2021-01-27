import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHeatingGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface WallMountedThermostatProChannel {
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

    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
  }

  handleCurrentHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.cooling ?
      this.platform.Characteristic.CurrentHeatingCoolingState.COOL : this.platform.Characteristic.CurrentHeatingCoolingState.HEAT);
  }

  handleTargetHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.cooling ?
      this.platform.Characteristic.CurrentHeatingCoolingState.COOL : this.platform.Characteristic.CurrentHeatingCoolingState.HEAT);
  }

  handleTargetHeatingCoolingStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    callback(null);
  }

  handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.actualTemperature);
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

  handleCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
    callback(null, this.humidity);
  }

  public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPHome, hmIPDevice, groups);
    this.home = hmIPHome;
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL') {
        const wthChannel = <WallMountedThermostatProChannel>channel;

        if (wthChannel.setPointTemperature !== this.setPointTemperature) {
          this.platform.log.info(`Target temperature of ${this.accessory.displayName} changed to ${wthChannel.setPointTemperature}`);
          this.setPointTemperature = wthChannel.setPointTemperature;
          this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.setPointTemperature);
        }

        if (wthChannel.actualTemperature !== this.actualTemperature) {
          this.platform.log.info(`Current temperature of ${this.accessory.displayName} changed to ${wthChannel.actualTemperature}`);
          this.actualTemperature = wthChannel.actualTemperature;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.actualTemperature);
        }

        if (wthChannel.humidity !== this.humidity) {
          this.platform.log.info(`Current relative humidity of ${this.accessory.displayName} changed to ${wthChannel.humidity}`);
          this.humidity = wthChannel.humidity;
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
        }

        for (const groupId of wthChannel.groups) {
          if (groups[groupId].type === 'HEATING') {
            this.heatingGroupId = groupId;
            const heatingGroup = <HmIPHeatingGroup>groups[groupId];

            if (heatingGroup.cooling !== null && heatingGroup.cooling !== this.cooling) {
              this.cooling = heatingGroup.cooling;
              this.platform.log.info(`Cooling mode of ${this.accessory.displayName} changed to ${this.cooling}`);
            }
          }
        }

      }
    }
  }
}
