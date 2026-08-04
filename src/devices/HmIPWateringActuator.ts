import type {CharacteristicValue, Service} from 'homebridge';
import {
  type HmIPDevice,
  type HmIPFunctionalChannel,
  type HmIPGroup,
  hasFunctionalChannelType,
  isHmIPRecord,
} from 'homematicip-cloud-client-ts';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface WateringActuatorChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'WATERING_ACTUATOR_CHANNEL';
  index: number;
  waterFlow?: number | null;
  waterVolume?: number | null;
  waterVolumeSinceOpen?: number | null;
  wateringActive?: boolean | null;
  wateringOnTime?: number | null;
}

const MAX_HOMEKIT_DURATION_SECONDS = 3600;
const DEFAULT_WATERING_DURATION_SECONDS = 3600;

function isWateringActuatorChannel(channel: HmIPFunctionalChannel): channel is WateringActuatorChannel {
  if (!hasFunctionalChannelType(channel, 'WATERING_ACTUATOR_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && typeof candidate.index === 'number'
    && (candidate.wateringActive === undefined || candidate.wateringActive === null
      || typeof candidate.wateringActive === 'boolean')
    && (candidate.wateringOnTime === undefined || candidate.wateringOnTime === null
      || typeof candidate.wateringOnTime === 'number');
}

function normalizeDuration(value: number): number {
  return Math.max(0, Math.min(MAX_HOMEKIT_DURATION_SECONDS, Math.round(value)));
}

/**
 * Homematic IP watering actuator
 *
 * HmIP-WSM / ELV-SH-WSM
 */
export class HmIPWateringActuator extends HmIPGenericDevice {
  private readonly service: Service | undefined;
  private activeSince: number | undefined;
  private channelIndex = 1;
  private statusFault = false;
  private wateringActive = false;
  private wateringOnTime = DEFAULT_WATERING_DURATION_SECONDS;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    const channel = Object.values(accessory.context.device.functionalChannels)
      .filter(isWateringActuatorChannel)
      .sort((left, right) => left.index - right.index)[0];
    if (!channel) {
      this.rejectMissingFunctionalServices(
        'WATERING_ACTUATOR_CHANNEL with numeric index and optional watering state',
      );
      return;
    }

    this.channelIndex = channel.index;
    this.wateringActive = channel.wateringActive ?? false;
    this.wateringOnTime = channel.wateringOnTime == null
      ? DEFAULT_WATERING_DURATION_SECONDS
      : normalizeDuration(channel.wateringOnTime);
    if (this.wateringActive) {
      this.activeSince = Date.now();
    }

    this.platform.log.debug('Created watering actuator %s', accessory.context.device.label);
    this.service = this.getOrAddService(this.platform.Service.Valve, accessory.context.device.label);
    this.service.setCharacteristic(
      this.platform.Characteristic.ValveType,
      this.platform.Characteristic.ValveType.IRRIGATION,
    );
    this.service.addOptionalCharacteristic(this.platform.Characteristic.SetDuration);
    this.service.addOptionalCharacteristic(this.platform.Characteristic.RemainingDuration);
    this.service.addOptionalCharacteristic(this.platform.Characteristic.StatusFault);

    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(() => this.wateringActive
        ? this.platform.Characteristic.Active.ACTIVE
        : this.platform.Characteristic.Active.INACTIVE)
      .onSet(value => this.handleActiveSet(value));
    this.service.getCharacteristic(this.platform.Characteristic.InUse)
      .onGet(() => this.wateringActive
        ? this.platform.Characteristic.InUse.IN_USE
        : this.platform.Characteristic.InUse.NOT_IN_USE);
    this.service.getCharacteristic(this.platform.Characteristic.SetDuration)
      .onGet(() => this.wateringOnTime)
      .onSet(value => {
        this.wateringOnTime = normalizeDuration(Number(value));
      });
    this.service.getCharacteristic(this.platform.Characteristic.RemainingDuration)
      .onGet(() => this.remainingDuration());
    this.service.getCharacteristic(this.platform.Characteristic.StatusFault)
      .onGet(() => this.statusFault
        ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
        : this.platform.Characteristic.StatusFault.NO_FAULT);
  }

  private async handleActiveSet(value: CharacteristicValue): Promise<void> {
    const wateringActive = Boolean(value);
    this.platform.log.info(
      'Setting watering actuator %s to %s',
      this.accessory.displayName,
      wateringActive ? 'ON' : 'OFF',
    );
    if (wateringActive && this.wateringOnTime > 0) {
      await this.platform.connector.command('device/control/setWateringSwitchStateWithTime', {
        channelIndex: this.channelIndex,
        deviceId: this.accessory.context.device.id,
        wateringActive: true,
        wateringTime: this.wateringOnTime,
      });
    } else {
      await this.platform.connector.command('device/control/setWateringSwitchState', {
        channelIndex: this.channelIndex,
        deviceId: this.accessory.context.device.id,
        wateringActive,
      });
    }
  }

  private remainingDuration(): number {
    if (!this.wateringActive || this.activeSince === undefined) {
      return 0;
    }
    const elapsedSeconds = Math.floor((Date.now() - this.activeSince) / 1000);
    return Math.max(0, this.wateringOnTime - elapsedSeconds);
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void {
    super.updateDevice(hmIPDevice, groups);
    if (!this.service) {
      return;
    }

    const channel = Object.values(hmIPDevice.functionalChannels).find(isWateringActuatorChannel);
    if (channel) {
      this.channelIndex = channel.index;
      if (typeof channel.wateringOnTime === 'number') {
        const duration = normalizeDuration(channel.wateringOnTime);
        if (duration !== this.wateringOnTime) {
          this.wateringOnTime = duration;
          this.service.updateCharacteristic(this.platform.Characteristic.SetDuration, duration);
        }
      }
      if (typeof channel.wateringActive === 'boolean' && channel.wateringActive !== this.wateringActive) {
        this.wateringActive = channel.wateringActive;
        this.activeSince = this.wateringActive ? Date.now() : undefined;
        this.service.updateCharacteristic(
          this.platform.Characteristic.Active,
          this.wateringActive
            ? this.platform.Characteristic.Active.ACTIVE
            : this.platform.Characteristic.Active.INACTIVE,
        );
        this.service.updateCharacteristic(
          this.platform.Characteristic.InUse,
          this.wateringActive
            ? this.platform.Characteristic.InUse.IN_USE
            : this.platform.Characteristic.InUse.NOT_IN_USE,
        );
        this.service.updateCharacteristic(
          this.platform.Characteristic.RemainingDuration,
          this.remainingDuration(),
        );
      }
    }

    const statusFault = Object.values(hmIPDevice.functionalChannels).some(candidate => {
      const record: unknown = candidate;
      return isHmIPRecord(record) && (
        record.deviceOverheated === true
        || record.deviceUndervoltage === true
        || record.frostProtectionError === true
        || record.valveFlowError === true
        || record.valveWaterError === true
      );
    });
    if (statusFault !== this.statusFault) {
      this.statusFault = statusFault;
      this.service.updateCharacteristic(
        this.platform.Characteristic.StatusFault,
        statusFault
          ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
          : this.platform.Characteristic.StatusFault.NO_FAULT,
      );
    }
  }
}
