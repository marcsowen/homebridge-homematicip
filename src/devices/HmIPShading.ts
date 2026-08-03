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

interface ShadingChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'SHADING_CHANNEL';
  index: number;
  primaryShadingLevel: number | null;
  previousPrimaryShadingLevel?: number | null;
  processing: boolean;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isShadingChannel(channel: HmIPFunctionalChannel): channel is ShadingChannel {
  if (!hasFunctionalChannelType(channel, 'SHADING_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && typeof candidate.index === 'number'
    && isNullableNumber(candidate.primaryShadingLevel)
    && (candidate.previousPrimaryShadingLevel === undefined
      || isNullableNumber(candidate.previousPrimaryShadingLevel))
    && typeof candidate.processing === 'boolean';
}

/**
 * Homematic IP shading module.
 *
 * HmIP-HDM1 (Hunter Douglas and erfal window coverings)
 */
export class HmIPShading extends HmIPGenericDevice {
  private readonly service: Service;
  private readonly channelIndex: number | undefined;
  private currentPosition = 0;
  private targetPosition = 0;
  private positionState: number;
  private processing = false;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    const channel = Object.values(accessory.context.device.functionalChannels).find(isShadingChannel);
    this.channelIndex = channel?.index;
    this.service = this.getOrAddService(this.platform.Service.WindowCovering, accessory.context.device.label);
    this.positionState = this.platform.Characteristic.PositionState.STOPPED;

    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .onGet(() => this.currentPosition);
    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .onGet(() => this.targetPosition)
      .onSet(value => this.handleTargetPositionSet(value));
    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .onGet(() => this.positionState);
    this.service.getCharacteristic(this.platform.Characteristic.HoldPosition)
      .onSet(value => this.handleHoldPositionSet(value));

    if (this.channelIndex === undefined) {
      this.platform.log.warn('No shading channel found for device %s', this.accessory.displayName);
    }
  }

  private async handleTargetPositionSet(value: CharacteristicValue): Promise<void> {
    const channelIndex = this.requireChannelIndex();
    this.targetPosition = Number(value);
    this.platform.log.info('Setting target shading position for %s to %s %%', this.accessory.displayName, value);
    await this.platform.connector.command('device/control/setPrimaryShadingLevel', {
      channelIndex,
      deviceId: this.accessory.context.device.id,
      primaryShadingLevel: HmIPShading.homeKitToHmIP(this.targetPosition),
    });
  }

  private async handleHoldPositionSet(value: CharacteristicValue): Promise<void> {
    if (value !== true) {
      return;
    }
    await this.platform.connector.command('device/control/stop', {
      channelIndex: this.requireChannelIndex(),
      deviceId: this.accessory.context.device.id,
    });
  }

  private requireChannelIndex(): number {
    if (this.channelIndex === undefined) {
      throw new Error(`No shading channel available for ${this.accessory.displayName}`);
    }
    return this.channelIndex;
  }

  public override updateDevice(device: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void {
    super.updateDevice(device, groups);
    const channel = Object.values(device.functionalChannels)
      .filter(isShadingChannel)
      .find(candidate => candidate.index === this.channelIndex);
    if (!channel) {
      return;
    }

    const previousPosition = channel.previousPrimaryShadingLevel == null
      ? this.currentPosition
      : HmIPShading.hmIPToHomeKit(channel.previousPrimaryShadingLevel);
    if (channel.primaryShadingLevel !== null) {
      const currentPosition = HmIPShading.hmIPToHomeKit(channel.primaryShadingLevel);
      if (currentPosition !== this.currentPosition) {
        this.currentPosition = currentPosition;
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.currentPosition);
      }
      if (!channel.processing && this.targetPosition !== currentPosition) {
        this.targetPosition = currentPosition;
        this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.targetPosition);
      }
    }

    this.processing = channel.processing;
    const positionState = !this.processing
      ? this.platform.Characteristic.PositionState.STOPPED
      : this.currentPosition >= previousPosition
        ? this.platform.Characteristic.PositionState.INCREASING
        : this.platform.Characteristic.PositionState.DECREASING;
    if (positionState !== this.positionState) {
      this.positionState = positionState;
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState);
    }
  }

  private static hmIPToHomeKit(level: number): number {
    return Math.round((1 - Math.min(1, Math.max(0, level))) * 100);
  }

  private static homeKitToHmIP(position: number): number {
    return 1 - Math.min(100, Math.max(0, position)) / 100;
  }
}
