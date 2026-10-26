import type {
  CharacteristicValue,
  Service,
} from 'homebridge';
import {
  type HmIPDevice,
  type HmIPFunctionalChannel,
  type HmIPGroup,
  hasFunctionalChannelType,
  isHmIPRecord,
} from 'homematicip-cloud-client-ts';
import {connectedGet, connectedSet} from '../HmIPAvailability.js';
import {sanitizeHomeKitName} from '../HmIPName.js';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

type BlindChannelType = 'BLIND_CHANNEL' | 'MULTI_MODE_INPUT_BLIND_CHANNEL';

interface BlindChannel extends HmIPFunctionalChannel {
  functionalChannelType: BlindChannelType;
  index: number;
  blindModeActive?: boolean | null;
  label?: string | null;
  shutterLevel?: number | null; // 0.0 = open, 1.0 = closed
  slatsLevel?: number | null; // 0.0 = open, 1.0 = closed
  processing?: boolean | null;
}

interface BlindRuntimeChannel {
  index: number;
  service: Service;
  shutterLevel: number;
  targetShutterLevel: number;
  slatsLevel: number;
  processing: boolean;
  supportsSlats: boolean;
}

function isBlindChannel(channel: HmIPFunctionalChannel): channel is BlindChannel {
  if (!hasFunctionalChannelType(channel, 'BLIND_CHANNEL', 'MULTI_MODE_INPUT_BLIND_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && typeof candidate.index === 'number'
    && (candidate.blindModeActive === undefined || candidate.blindModeActive === null
      || typeof candidate.blindModeActive === 'boolean')
    && (candidate.label === undefined || candidate.label === null || typeof candidate.label === 'string')
    && (candidate.shutterLevel === undefined || candidate.shutterLevel === null
      || typeof candidate.shutterLevel === 'number')
    && (candidate.slatsLevel === undefined || candidate.slatsLevel === null || typeof candidate.slatsLevel === 'number')
    && (candidate.processing === undefined || candidate.processing === null || typeof candidate.processing === 'boolean');
}

function expectedChannelType(deviceType: string): BlindChannelType {
  // The reference client models HmIP-DRBLI4 actuator outputs as multi-mode
  // input blind channels. Other blind actuators use ordinary blind channels.
  return deviceType === 'DIN_RAIL_BLIND_4'
    ? 'MULTI_MODE_INPUT_BLIND_CHANNEL'
    : 'BLIND_CHANNEL';
}

function getChannelLabel(device: HmIPDevice, channel: BlindChannel, channelCount: number): string {
  const label = channel.label?.trim();
  if (label) {
    return label;
  }
  return channelCount === 1 ? device.label : `${device.label} ${channel.index}`;
}

/**
 * Homematic IP blinds
 *
 * HmIP-FBL Blind Actuator - flush-mount
 * HmIP-BBL Blind Actuator - brand-mount
 * HmIP-DRBLI4 Blind Actuator - DIN rail mount, 4 channels
 */
export class HmIPBlind extends HmIPGenericDevice {
  private readonly channels = new Map<number, BlindRuntimeChannel>();

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    const device = accessory.context.device;
    const channelType = expectedChannelType(device.type);
    const blindChannels = Object.values(device.functionalChannels)
      .filter(isBlindChannel)
      .filter(channel => channel.functionalChannelType === channelType)
      .filter(channel => accessory.context.channelIndex === undefined
        || channel.index === accessory.context.channelIndex)
      .sort((left, right) => left.index - right.index);
    const legacyService = this.accessory.services.find(service =>
      service.UUID === this.platform.Service.WindowCovering.UUID && service.subtype === undefined);

    for (const [position, channel] of blindChannels.entries()) {
      let service = this.accessory.getServiceById(this.platform.Service.WindowCovering, channel.index.toString());
      if (!service && position === 0 && legacyService) {
        // Reuse the original single-channel service so existing HomeKit names,
        // rooms, scenes, and automations remain intact after upgrading.
        service = legacyService;
      }
      if (!service) {
        service = this.accessory.addService(new this.platform.Service.WindowCovering(
          sanitizeHomeKitName(getChannelLabel(device, channel, blindChannels.length)),
          channel.index.toString(),
        ));
      }
      if (blindChannels.length > 1) {
        this.setServiceLabelIndex(service, channel.index);
      }

      const runtimeChannel: BlindRuntimeChannel = {
        index: channel.index,
        service,
        shutterLevel: channel.shutterLevel ?? 0,
        targetShutterLevel: channel.shutterLevel ?? 0,
        slatsLevel: channel.slatsLevel ?? 0,
        processing: channel.processing ?? false,
        supportsSlats: channel.blindModeActive !== false,
      };
      service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
        .onGet(connectedGet(this.platform, () => HmIPBlind.shutterHmIPToHomeKit(runtimeChannel.shutterLevel)));
      service.getCharacteristic(this.platform.Characteristic.TargetPosition)
        .onGet(connectedGet(this.platform, () => HmIPBlind.shutterHmIPToHomeKit(runtimeChannel.targetShutterLevel)))
        .onSet(connectedSet(this.platform, value => this.handleTargetPositionSet(runtimeChannel, value)));
      service.getCharacteristic(this.platform.Characteristic.PositionState)
        .onGet(connectedGet(this.platform, () => runtimeChannel.processing
          ? this.platform.Characteristic.PositionState.DECREASING
          : this.platform.Characteristic.PositionState.STOPPED));
      service.getCharacteristic(this.platform.Characteristic.HoldPosition)
        .onSet(connectedSet(this.platform, value => this.handleHoldPositionSet(runtimeChannel, value)));
      if (runtimeChannel.supportsSlats) {
        service.getCharacteristic(this.platform.Characteristic.CurrentHorizontalTiltAngle)
          .onGet(connectedGet(this.platform, () => HmIPBlind.slatsHmIPToHomeKit(runtimeChannel.slatsLevel)));
        service.getCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle)
          .onGet(connectedGet(this.platform, () => HmIPBlind.slatsHmIPToHomeKit(runtimeChannel.slatsLevel)))
          .onSet(connectedSet(this.platform, value => this.handleTargetHorizontalTiltAngleSet(runtimeChannel, value)));
      } else {
        this.removeSlatCharacteristics(service);
      }
      this.channels.set(channel.index, runtimeChannel);
      this.platform.log.debug('Added blind channel %d to %s', channel.index, this.accessory.displayName);
    }

    if (this.channels.size === 0) {
      this.rejectMissingFunctionalServices(
        `${channelType} with numeric index and optional shutterLevel, slatsLevel, and processing values`,
      );
    } else {
      this.removeStaleWindowCoveringServices();
    }
  }

  private removeSlatCharacteristics(service: Service): void {
    for (const characteristicType of [
      this.platform.Characteristic.CurrentHorizontalTiltAngle,
      this.platform.Characteristic.TargetHorizontalTiltAngle,
    ]) {
      if (service.testCharacteristic(characteristicType)) {
        service.removeCharacteristic(service.getCharacteristic(characteristicType));
      }
    }
  }

  private removeStaleWindowCoveringServices(): void {
    const activeServices = new Set([...this.channels.values()].map(channel => channel.service));
    for (const service of [...this.accessory.services]) {
      if (service.UUID === this.platform.Service.WindowCovering.UUID && !activeServices.has(service)) {
        this.accessory.removeService(service);
        this.platform.log.debug('Removed obsolete blind service %s from %s', service.displayName,
          this.accessory.displayName);
      }
    }
  }

  private async handleTargetPositionSet(
    channel: BlindRuntimeChannel,
    value: CharacteristicValue,
  ): Promise<void> {
    const targetPosition = Number(value);
    if (!Number.isFinite(targetPosition)) {
      throw new Error(`Invalid HomeKit blind position: ${String(value)}`);
    }
    this.platform.log.info('Setting target blind position for %s channel %d to %s %%',
      this.accessory.displayName, channel.index, targetPosition);
    const shutterLevel = HmIPBlind.shutterHomeKitToHmIP(Math.min(100, Math.max(0, targetPosition)));
    channel.targetShutterLevel = shutterLevel;
    await this.platform.connector.command('setShutterLevel', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
      shutterLevel,
    });
  }

  private async handleHoldPositionSet(
    channel: BlindRuntimeChannel,
    value: CharacteristicValue,
  ): Promise<void> {
    if (value !== true) {
      return;
    }
    this.platform.log.info('Stopping blind %s channel %d', this.accessory.displayName, channel.index);
    await this.platform.connector.command('stop', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
    });
  }

  private async handleTargetHorizontalTiltAngleSet(
    channel: BlindRuntimeChannel,
    value: CharacteristicValue,
  ): Promise<void> {
    const targetAngle = Number(value);
    if (!Number.isFinite(targetAngle)) {
      throw new Error(`Invalid HomeKit blind slats angle: ${String(value)}`);
    }
    this.platform.log.info('Setting target slats position for %s channel %d to %s°',
      this.accessory.displayName, channel.index, targetAngle);
    await this.platform.connector.command('setSlatsLevel', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
      // HomeKit scenes set height and slat angle independently. Use the latest
      // requested height so this command cannot restore an outdated position.
      shutterLevel: channel.targetShutterLevel,
      slatsLevel: HmIPBlind.slatsHomeKitToHmIP(Math.min(90, Math.max(-90, targetAngle))),
    });
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void {
    super.updateDevice(hmIPDevice, groups);
    const channelType = expectedChannelType(hmIPDevice.type);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (!isBlindChannel(channel) || channel.functionalChannelType !== channelType) {
        continue;
      }
      const runtimeChannel = this.channels.get(channel.index);
      if (!runtimeChannel) {
        continue;
      }

      if (typeof channel.shutterLevel === 'number' && channel.shutterLevel !== runtimeChannel.shutterLevel) {
        runtimeChannel.shutterLevel = channel.shutterLevel;
        if (channel.processing === false) {
          runtimeChannel.targetShutterLevel = channel.shutterLevel;
        }
        const position = HmIPBlind.shutterHmIPToHomeKit(runtimeChannel.shutterLevel);
        runtimeChannel.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, position);
        runtimeChannel.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, position);
        this.platform.log.debug('Blind position of %s channel %d changed to %s %%', this.accessory.displayName,
          runtimeChannel.index, position.toFixed(0));
      }

      if (typeof channel.processing === 'boolean' && channel.processing !== runtimeChannel.processing) {
        runtimeChannel.processing = channel.processing;
        runtimeChannel.service.updateCharacteristic(
          this.platform.Characteristic.PositionState,
          runtimeChannel.processing
            ? this.platform.Characteristic.PositionState.DECREASING
            : this.platform.Characteristic.PositionState.STOPPED,
        );
      }

      if (runtimeChannel.supportsSlats
        && typeof channel.slatsLevel === 'number'
        && channel.slatsLevel !== runtimeChannel.slatsLevel) {
        runtimeChannel.slatsLevel = channel.slatsLevel;
        const angle = HmIPBlind.slatsHmIPToHomeKit(runtimeChannel.slatsLevel);
        runtimeChannel.service.updateCharacteristic(this.platform.Characteristic.CurrentHorizontalTiltAngle, angle);
        runtimeChannel.service.updateCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle, angle);
        this.platform.log.debug('Blind slats of %s channel %d changed to %s°', this.accessory.displayName,
          runtimeChannel.index, angle.toFixed(0));
      }
    }
  }

  private static shutterHmIPToHomeKit(value: number): number {
    return (1 - value) * 100;
  }

  private static shutterHomeKitToHmIP(value: number): number {
    return (100 - value) / 100;
  }

  private static slatsHmIPToHomeKit(value: number): number {
    return -90 + (value * 180);
  }

  private static slatsHomeKitToHmIP(value: number): number {
    return (value + 90) / 180;
  }
}
