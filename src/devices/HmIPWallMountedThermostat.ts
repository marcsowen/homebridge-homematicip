
import type {HmIPPlatform} from '../HmIPPlatform.js';
import {
  type HmIPDevice,
  type HmIPFunctionalChannel,
  type HmIPGroup,
  type HmIPHeatingGroup,
  hasFunctionalChannelType,
  isHmIPRecord,
} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {type HistoryEvent, HmIPHeatingThermostat, type ThermostatChannel} from './HmIPHeatingThermostat.js';

interface WallMountedThermostatChannel extends ThermostatChannel {
  functionalChannelType: 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL'
    | 'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL';
  actualTemperature: number | null;
  humidity: number | null;
}

interface WallMountedThermostatInternalSwitchChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'INTERNAL_SWITCH_CHANNEL';
  valvePosition: number | null;
}

function isWallMountedThermostatChannel(
  channel: HmIPFunctionalChannel,
): channel is WallMountedThermostatChannel {
  if (!hasFunctionalChannelType(
    channel,
    'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL',
    'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL',
  )) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && (candidate.setPointTemperature === null || typeof candidate.setPointTemperature === 'number')
    && Array.isArray(candidate.groups)
    && candidate.groups.every(groupId => typeof groupId === 'string')
    && (candidate.actualTemperature === null || typeof candidate.actualTemperature === 'number')
    && (candidate.humidity === null || typeof candidate.humidity === 'number');
}

function isInternalSwitchChannel(
  channel: HmIPFunctionalChannel,
): channel is WallMountedThermostatInternalSwitchChannel {
  const candidate: unknown = channel;
  return hasFunctionalChannelType(channel, 'INTERNAL_SWITCH_CHANNEL')
    && isHmIPRecord(candidate)
    && (candidate.valvePosition === null || typeof candidate.valvePosition === 'number');
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
export class HmIPWallMountedThermostat extends HmIPHeatingThermostat {
  private humidity = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(() => this.humidity);
  }

  override updateDevice(hmIPDevice: HmIPDevice, groups: { [p: string]: HmIPGroup }) {
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (isInternalSwitchChannel(channel)) {
        // this.platform.log.debug('internalSwitchChannel', JSON.stringify(channel));
        this.updateValvePosition(channel.valvePosition, 'internalSwitchChannel');
      }
      if (isWallMountedThermostatChannel(channel)) {
        this.updateSetPointTemperature(channel.setPointTemperature, 'device channel');
        this.updateActualTemperature(channel.actualTemperature);
        this.updateHumidity(channel.humidity);
      }
    }
    // call super method that manages heating groups etc.
    super.updateDevice(hmIPDevice, groups);
  }

  protected updateHumidity(updatedHumidity: number | null) {
    if (updatedHumidity !== null && updatedHumidity !== this.humidity) {
      this.humidity = updatedHumidity;
      this.platform.log.debug('Current relative humidity of %s changed to %s %%', this.accessory.displayName, this.humidity);
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
    }
  }

  protected override updateByHeatingGroup(heatingGroup: HmIPHeatingGroup, channel: HmIPFunctionalChannel) {
    super.updateByHeatingGroup(heatingGroup, channel);
    this.updateValvePosition(heatingGroup.valvePosition, 'group'); // if heatingGroup provides valvePosition: use it
  }

  protected override createHistoryEvent(): HistoryEvent {
    return {
      time: Math.floor(Date.now() / 1000),
      setTemp: this.setPointTemperature,
      valvePosition: this.getCurrentValvePositionAsInt(),
      humidity: this.humidity,
      temp: this.actualTemperature,
    };
  }

  protected override getHistoryEventType(): string {
    return 'custom';
  }

}
