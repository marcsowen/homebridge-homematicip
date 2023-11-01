import {
  CharacteristicGetCallback,
  PlatformAccessory,
} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform.js';
import {HmIPDevice, HmIPFunctionalChannel, HmIPGroup, HmIPHeatingGroup, Updateable} from '../HmIPState.js';
import {HistoryEvent, HmIPHeatingThermostat, ThermostatChannel} from './HmIPHeatingThermostat.js';
import moment from 'moment';

interface WallMountedThermostatChannel extends ThermostatChannel {
  actualTemperature: number;
  humidity: number;
}

interface WallMountedThermostatInternalSwitchChannel {
  functionalChannelType: string;
  valvePosition: number;
}

/**
 * HomematicIP Wall Mounted Heating Thermostat and climate sensors
 *
 * HmIP-WTH
 * HmIP-WTH-2
 * HMIP-WTH-B
 * HmIP-BWTH
 * HmIP-STH
 * HmIP-STHD
 * ALPHA-IP-RBG
 */
export class HmIPWallMountedThermostat extends HmIPHeatingThermostat implements Updateable {
  private humidity = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
  }

  updateDevice(hmIPDevice: HmIPDevice, groups: { [p: string]: HmIPGroup }) {
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'INTERNAL_SWITCH_CHANNEL') {
        // this.platform.log.debug('internalSwitchChannel', JSON.stringify(channel));
        const wthsChannel = <WallMountedThermostatInternalSwitchChannel>channel;
        this.updateValvePosition(wthsChannel.valvePosition, 'internalSwitchChannel');
      }
      if (channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL'
        || channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL') {
        const wthChannel = <WallMountedThermostatChannel>channel;
        this.updateSetPointTemperature(wthChannel.setPointTemperature, 'device channel');
        this.updateActualTemperature(wthChannel.actualTemperature);
        this.updateHumidity(wthChannel.humidity);
      }
    }
    // call super method that manages heating groups etc.
    super.updateDevice(hmIPDevice, groups);
  }

  protected updateHumidity(updatedHumidity: number) {
    if (updatedHumidity !== null && updatedHumidity !== this.humidity) {
      this.humidity = updatedHumidity;
      this.platform.log.debug('Current relative humidity of %s changed to %s %%', this.accessory.displayName, this.humidity);
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
    }
  }

  protected updateByHeatingGroup(heatingGroup: HmIPHeatingGroup, channel: HmIPFunctionalChannel) {
    super.updateByHeatingGroup(heatingGroup, channel);
    this.updateValvePosition(heatingGroup.valvePosition, 'group'); // if heatingGroup provides valvePosition: use it
  }

  protected createHistoryEvent(): HistoryEvent {
    return {
      time: moment().unix(),
      setTemp: this.setPointTemperature,
      valvePosition: this.getCurrentValvePositionAsInt(),
      humidity: this.humidity,
      temp: this.actualTemperature,
    };
  }

  protected getHistoryEventType(): string {
    return 'custom';
  }

  handleCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
    callback(null, this.humidity);
  }

}
