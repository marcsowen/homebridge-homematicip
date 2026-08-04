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
import {sanitizeHomeKitName} from '../HmIPName.js';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

type DimmerChannelType = 'DIMMER_CHANNEL' | 'MULTI_MODE_INPUT_DIMMER_CHANNEL';

interface DimmerChannel extends HmIPFunctionalChannel {
  functionalChannelType: DimmerChannelType;
  dimLevel?: number | null;
  index: number;
  label?: string | null;
}

interface DimmerRuntimeChannel {
  dimLevel: number;
  index: number;
  hapService: Service;
}

function isDimmerChannel(channel: HmIPFunctionalChannel): channel is DimmerChannel {
  if (!hasFunctionalChannelType(channel, 'DIMMER_CHANNEL', 'MULTI_MODE_INPUT_DIMMER_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && (candidate.dimLevel === undefined || candidate.dimLevel === null || typeof candidate.dimLevel === 'number')
    && typeof candidate.index === 'number'
    && (candidate.label === undefined || candidate.label === null || typeof candidate.label === 'string');
}

function expectedChannelType(deviceType: string): DimmerChannelType {
  // The reference client models the HmIP-DRDI3 outputs as multi-mode input
  // dimmer channels. All other supported dimmers, including HmIPW-DRD3,
  // expose their actuator outputs as ordinary dimmer channels.
  return deviceType === 'DIN_RAIL_DIMMER_3'
    ? 'MULTI_MODE_INPUT_DIMMER_CHANNEL'
    : 'DIMMER_CHANNEL';
}

function toBrightness(dimLevel: number): number {
  return Math.round(Math.min(1, Math.max(0, dimLevel)) * 100);
}

/**
 * Homematic IP dimmers
 *
 * HmIP-PDT Pluggable Dimmer
 * HmIP-BDT Brand Dimmer
 * HmIP-FDT Dimming Actuator flush-mount
 * HmIPW-DRD3 Wired Dimming Actuator - 3 channels
 * HmIP-DRDI3 DIN Rail Dimming Actuator - 3 channels
 */
export class HmIPDimmer extends HmIPGenericDevice {
  private readonly channels = new Map<number, DimmerRuntimeChannel>();

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created dimmer ${accessory.context.device.label}`);

    const device = accessory.context.device;
    const channelType = expectedChannelType(device.type);
    const dimmerChannels = Object.values(device.functionalChannels)
      .filter(isDimmerChannel)
      .filter(channel => channel.functionalChannelType === channelType)
      .sort((left, right) => left.index - right.index);
    const legacyService = this.accessory.services.find(service =>
      service.UUID === this.platform.Service.Lightbulb.UUID && service.subtype === undefined);

    for (const [position, channel] of dimmerChannels.entries()) {
      if (this.channels.has(channel.index)) {
        continue;
      }

      let hapService = this.accessory.getServiceById(this.platform.Service.Lightbulb, channel.index.toString());
      if (!hapService && position === 0 && legacyService) {
        // Before multichannel support, ordinary dimmers had one service without
        // a subtype. Reuse it to retain HomeKit room, automation, and name data.
        hapService = legacyService;
      }
      if (!hapService) {
        const label = this.channelLabel(channel, dimmerChannels.length);
        hapService = this.accessory.addService(
          new this.platform.Service.Lightbulb(sanitizeHomeKitName(label), channel.index.toString()),
        );
      }

      const runtimeChannel: DimmerRuntimeChannel = {
        dimLevel: channel.dimLevel ?? 0,
        index: channel.index,
        hapService,
      };
      hapService.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => runtimeChannel.dimLevel > 0)
        .onSet(value => this.handleOnSet(runtimeChannel, value));
      hapService.getCharacteristic(this.platform.Characteristic.Brightness)
        .onGet(() => toBrightness(runtimeChannel.dimLevel))
        .onSet(value => this.handleBrightnessSet(runtimeChannel, value));
      this.channels.set(channel.index, runtimeChannel);
      this.platform.log.debug('Added dimmer channel %d to %s', channel.index, this.accessory.displayName);
    }

    if (this.channels.size === 0) {
      this.rejectMissingFunctionalServices(`${channelType} with numeric index and optional number/null dimLevel`);
    } else {
      this.removeStaleLightbulbServices();
    }
  }

  private channelLabel(channel: DimmerChannel, channelCount: number): string {
    const label = channel.label?.trim();
    if (label) {
      return label;
    }
    return channelCount === 1
      ? this.accessory.context.device.label
      : `${this.accessory.context.device.label} ${channel.index}`;
  }

  private removeStaleLightbulbServices(): void {
    const activeServices = new Set([...this.channels.values()].map(channel => channel.hapService));
    for (const service of [...this.accessory.services]) {
      if (service.UUID === this.platform.Service.Lightbulb.UUID && !activeServices.has(service)) {
        this.accessory.removeService(service);
        this.platform.log.debug('Removed obsolete dimmer service %s from %s', service.displayName,
          this.accessory.displayName);
      }
    }
  }

  private async handleOnSet(channel: DimmerRuntimeChannel, value: CharacteristicValue): Promise<void> {
    if (value && channel.dimLevel === 0) {
      await this.setBrightness(channel, 100);
    } else if (!value) {
      await this.setBrightness(channel, 0);
    }
  }

  private async handleBrightnessSet(channel: DimmerRuntimeChannel, value: CharacteristicValue): Promise<void> {
    const brightness = Number(value);
    if (!Number.isFinite(brightness)) {
      throw new Error(`Invalid HomeKit brightness value: ${String(value)}`);
    }
    await this.setBrightness(channel, Math.min(100, Math.max(0, brightness)));
  }

  private async setBrightness(channel: DimmerRuntimeChannel, brightness: number): Promise<void> {
    this.platform.log.info('Setting brightness of %s channel %d to %s %%', this.accessory.displayName,
      channel.index, brightness);
    await this.platform.connector.command('device/control/setDimLevel', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
      dimLevel: brightness / 100,
    });
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void {
    super.updateDevice(hmIPDevice, groups);
    const channelType = expectedChannelType(hmIPDevice.type);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (!isDimmerChannel(channel) || channel.functionalChannelType !== channelType
        || typeof channel.dimLevel !== 'number') {
        continue;
      }

      const currentChannel = this.channels.get(channel.index);
      if (!currentChannel || currentChannel.dimLevel === channel.dimLevel) {
        continue;
      }

      const wasOn = currentChannel.dimLevel > 0;
      currentChannel.dimLevel = channel.dimLevel;
      const isOn = currentChannel.dimLevel > 0;
      if (wasOn !== isOn) {
        currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.On, isOn);
      }
      currentChannel.hapService.updateCharacteristic(
        this.platform.Characteristic.Brightness,
        toBrightness(currentChannel.dimLevel),
      );
      this.platform.log.debug('Brightness of %s channel %d changed to %d %%', this.accessory.displayName,
        currentChannel.index, toBrightness(currentChannel.dimLevel));
    }
  }
}
