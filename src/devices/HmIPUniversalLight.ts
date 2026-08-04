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

interface UniversalLightFeatures {
  IOptionalFeatureColorTemperature?: boolean;
  IOptionalFeatureHueSaturationValue?: boolean;
}

interface UniversalLightChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'UNIVERSAL_LIGHT_CHANNEL';
  channelRole: 'UNIVERSAL_LIGHT_ACTUATOR';
  colorTemperature?: number | null;
  dimLevel?: number | null;
  hue?: number | null;
  index: number;
  label?: string | null;
  maximumColorTemperature?: number | null;
  minimalColorTemperature?: number | null;
  on?: boolean | null;
  saturationLevel?: number | null;
  supportedOptionalFeatures?: UniversalLightFeatures;
}

interface RuntimeChannel {
  colorTemperature: number;
  dimLevel: number;
  hapService: Service;
  hue: number;
  index: number;
  maximumColorTemperature: number;
  minimalColorTemperature: number;
  on: boolean;
  saturationLevel: number;
  supportsColorTemperature: boolean;
  supportsHueSaturation: boolean;
}

function isOptionalNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || typeof value === 'number';
}

function isUniversalLightChannel(channel: HmIPFunctionalChannel): channel is UniversalLightChannel {
  if (!hasFunctionalChannelType(channel, 'UNIVERSAL_LIGHT_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && candidate.channelRole === 'UNIVERSAL_LIGHT_ACTUATOR'
    && typeof candidate.index === 'number'
    && (candidate.label === undefined || candidate.label === null || typeof candidate.label === 'string')
    && isOptionalNumber(candidate.colorTemperature)
    && isOptionalNumber(candidate.dimLevel)
    && isOptionalNumber(candidate.hue)
    && isOptionalNumber(candidate.maximumColorTemperature)
    && isOptionalNumber(candidate.minimalColorTemperature)
    && (candidate.on === undefined || candidate.on === null || typeof candidate.on === 'boolean')
    && isOptionalNumber(candidate.saturationLevel)
    && (candidate.supportedOptionalFeatures === undefined
      || isHmIPRecord(candidate.supportedOptionalFeatures));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toBrightness(dimLevel: number): number {
  return Math.round(clamp(dimLevel, 0, 1) * 100);
}

function kelvinToMired(colorTemperature: number): number {
  return Math.round(1_000_000 / colorTemperature);
}

function miredToKelvin(colorTemperature: number): number {
  return Math.round(1_000_000 / colorTemperature);
}

/**
 * Universal light outputs such as the HmIP-RGBW. The device configuration
 * determines whether each active output is dim-only, tunable white, or RGB.
 */
export class HmIPUniversalLight extends HmIPGenericDevice {
  private readonly channels = new Map<number, RuntimeChannel>();

  constructor(platform: HmIPPlatform, accessory: HmIPPlatformAccessory) {
    super(platform, accessory);

    const device = accessory.context.device;
    const lightChannels = Object.values(device.functionalChannels)
      .filter(isUniversalLightChannel)
      .filter(channel => typeof channel.dimLevel === 'number' || typeof channel.on === 'boolean')
      .sort((left, right) => left.index - right.index);

    for (const channel of lightChannels) {
      const features = channel.supportedOptionalFeatures;
      const minimumColorTemperature = channel.minimalColorTemperature ?? 2000;
      const maximumColorTemperature = channel.maximumColorTemperature ?? 6500;
      const runtimeChannel: RuntimeChannel = {
        colorTemperature: channel.colorTemperature ?? 4000,
        dimLevel: channel.dimLevel ?? 0,
        hapService: this.getOrAddService(
          this.platform.Service.Lightbulb,
          channel.label?.trim() || (lightChannels.length === 1 ? device.label : `${device.label} ${channel.index}`),
          channel.index.toString(),
        ),
        hue: channel.hue ?? 0,
        index: channel.index,
        maximumColorTemperature,
        minimalColorTemperature: minimumColorTemperature,
        on: channel.on ?? (channel.dimLevel ?? 0) > 0,
        saturationLevel: channel.saturationLevel ?? 0,
        supportsColorTemperature: features?.IOptionalFeatureColorTemperature === true,
        supportsHueSaturation: features?.IOptionalFeatureHueSaturationValue === true,
      };

      this.bindCharacteristics(runtimeChannel);
      this.channels.set(channel.index, runtimeChannel);
      this.platform.log.debug('Added universal light channel %d to %s', channel.index, this.accessory.displayName);
    }

    if (this.channels.size === 0) {
      this.rejectMissingFunctionalServices(
        'active UNIVERSAL_LIGHT_CHANNEL with channelRole UNIVERSAL_LIGHT_ACTUATOR and a switch or dim level state',
      );
    } else {
      this.removeStaleLightbulbServices();
    }
  }

  private bindCharacteristics(channel: RuntimeChannel): void {
    channel.hapService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => channel.on)
      .onSet(value => this.setOn(channel, value));
    channel.hapService.getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(() => toBrightness(channel.dimLevel))
      .onSet(value => this.setBrightness(channel, value));

    if (channel.supportsHueSaturation) {
      channel.hapService.getCharacteristic(this.platform.Characteristic.Hue)
        .onGet(() => channel.hue)
        .onSet(value => this.setHue(channel, value));
      channel.hapService.getCharacteristic(this.platform.Characteristic.Saturation)
        .onGet(() => channel.saturationLevel * 100)
        .onSet(value => this.setSaturation(channel, value));
    }

    if (channel.supportsColorTemperature) {
      const minimumMired = kelvinToMired(channel.maximumColorTemperature);
      const maximumMired = kelvinToMired(channel.minimalColorTemperature);
      channel.hapService.getCharacteristic(this.platform.Characteristic.ColorTemperature)
        .setProps({minValue: minimumMired, maxValue: maximumMired})
        .onGet(() => kelvinToMired(channel.colorTemperature))
        .onSet(value => this.setColorTemperature(channel, value));
    }
  }

  private async setOn(channel: RuntimeChannel, value: CharacteristicValue): Promise<void> {
    const on = Boolean(value);
    await this.platform.connector.command('device/control/setSwitchState', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
      on,
    });
    channel.on = on;
  }

  private async setBrightness(channel: RuntimeChannel, value: CharacteristicValue): Promise<void> {
    const brightness = this.numberValue(value, 'brightness');
    const dimLevel = clamp(brightness, 0, 100) / 100;
    await this.platform.connector.command('device/control/setDimLevel', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
      dimLevel,
    });
    channel.dimLevel = dimLevel;
  }

  private async setHue(channel: RuntimeChannel, value: CharacteristicValue): Promise<void> {
    const hue = clamp(this.numberValue(value, 'hue'), 0, 360);
    await this.setHueSaturation(channel, hue, channel.saturationLevel);
    channel.hue = hue;
  }

  private async setSaturation(channel: RuntimeChannel, value: CharacteristicValue): Promise<void> {
    const saturationLevel = clamp(this.numberValue(value, 'saturation'), 0, 100) / 100;
    await this.setHueSaturation(channel, channel.hue, saturationLevel);
    channel.saturationLevel = saturationLevel;
  }

  private async setHueSaturation(channel: RuntimeChannel, hue: number, saturationLevel: number): Promise<void> {
    await this.platform.connector.command('device/control/setHueSaturationDimLevel', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
      hue,
      saturationLevel,
      dimLevel: channel.dimLevel,
    });
  }

  private async setColorTemperature(channel: RuntimeChannel, value: CharacteristicValue): Promise<void> {
    const mired = this.numberValue(value, 'color temperature');
    const kelvin = clamp(
      miredToKelvin(mired),
      channel.minimalColorTemperature,
      channel.maximumColorTemperature,
    );
    await this.platform.connector.command('device/control/setColorTemperatureDimLevel', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
      colorTemperature: kelvin,
      dimLevel: channel.dimLevel,
    });
    channel.colorTemperature = kelvin;
  }

  private numberValue(value: CharacteristicValue, name: string): number {
    const number = Number(value);
    if (!Number.isFinite(number) || (number <= 0 && name === 'color temperature')) {
      throw new Error(`Invalid HomeKit ${name} value: ${String(value)}`);
    }
    return number;
  }

  private removeStaleLightbulbServices(): void {
    const activeServices = new Set([...this.channels.values()].map(channel => channel.hapService));
    for (const service of [...this.accessory.services]) {
      if (service.UUID === this.platform.Service.Lightbulb.UUID && !activeServices.has(service)) {
        this.accessory.removeService(service);
      }
    }
  }

  public override updateDevice(device: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void {
    super.updateDevice(device, groups);
    for (const channel of Object.values(device.functionalChannels)) {
      if (!isUniversalLightChannel(channel)) {
        continue;
      }
      const runtimeChannel = this.channels.get(channel.index);
      if (!runtimeChannel) {
        continue;
      }

      if (typeof channel.on === 'boolean' && channel.on !== runtimeChannel.on) {
        runtimeChannel.on = channel.on;
        runtimeChannel.hapService.updateCharacteristic(this.platform.Characteristic.On, channel.on);
      }
      if (typeof channel.dimLevel === 'number' && channel.dimLevel !== runtimeChannel.dimLevel) {
        runtimeChannel.dimLevel = channel.dimLevel;
        runtimeChannel.hapService.updateCharacteristic(
          this.platform.Characteristic.Brightness,
          toBrightness(channel.dimLevel),
        );
      }
      if (runtimeChannel.supportsHueSaturation && typeof channel.hue === 'number'
        && channel.hue !== runtimeChannel.hue) {
        runtimeChannel.hue = channel.hue;
        runtimeChannel.hapService.updateCharacteristic(this.platform.Characteristic.Hue, channel.hue);
      }
      if (runtimeChannel.supportsHueSaturation && typeof channel.saturationLevel === 'number'
        && channel.saturationLevel !== runtimeChannel.saturationLevel) {
        runtimeChannel.saturationLevel = channel.saturationLevel;
        runtimeChannel.hapService.updateCharacteristic(
          this.platform.Characteristic.Saturation,
          channel.saturationLevel * 100,
        );
      }
      if (runtimeChannel.supportsColorTemperature && typeof channel.colorTemperature === 'number'
        && channel.colorTemperature !== runtimeChannel.colorTemperature) {
        runtimeChannel.colorTemperature = channel.colorTemperature;
        runtimeChannel.hapService.updateCharacteristic(
          this.platform.Characteristic.ColorTemperature,
          kelvinToMired(channel.colorTemperature),
        );
      }
    }
  }
}
