import type {
  CharacteristicValue,
  Service,
} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import {
  type HmIPDevice,
  type HmIPFunctionalChannel,
  type HmIPGroup,
  hasFunctionalChannelType,
  isHmIPRecord,
} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface ButtonChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'SINGLE_KEY_CHANNEL';
  index: number;
  label?: string | null;
}

interface ButtonRuntimeChannel {
  hapService: Service;
  index: number;
  lastEvent?: string;
}

interface SwitchChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'SWITCH_CHANNEL';
  index: number;
  label?: string | null;
  on: boolean | null;
}

interface SwitchRuntimeChannel {
  hapService: Service;
  index: number;
  on: boolean;
}

function isButtonChannel(channel: HmIPFunctionalChannel): channel is ButtonChannel {
  if (!hasFunctionalChannelType(channel, 'SINGLE_KEY_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && typeof candidate.index === 'number'
    && (candidate.label === undefined || candidate.label === null || typeof candidate.label === 'string');
}

function isSwitchChannel(channel: HmIPFunctionalChannel): channel is SwitchChannel {
  if (!hasFunctionalChannelType(channel, 'SWITCH_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && typeof candidate.index === 'number'
    && (candidate.label === undefined || candidate.label === null || typeof candidate.label === 'string')
    && (candidate.on === null || typeof candidate.on === 'boolean');
}

/**
 * Homematic IP button and remote-control accessories.
 *
 * Combination devices such as HmIP-WRC6-230 may additionally expose an
 * actuator switch. Optical signalling channels are intentionally not exposed
 * as HomeKit lights.
 */
export class HmIPButton extends HmIPGenericDevice {
  private readonly buttonChannels = new Map<number, ButtonRuntimeChannel>();
  private readonly switchChannels = new Map<number, SwitchRuntimeChannel>();

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created button ${accessory.context.device.label}`);
    const device = accessory.context.device;
    this.addButtonChannels(device);
    this.addSwitchChannels(device);

    if (this.buttonChannels.size === 0) {
      this.platform.log.warn('No functional button channels found for device %s', this.accessory.displayName);
    } else {
      this.removeStaleServices(this.platform.Service.StatelessProgrammableSwitch.UUID,
        new Set([...this.buttonChannels.values()].map(channel => channel.hapService)));
    }
    if (this.switchChannels.size > 0) {
      this.removeStaleServices(this.platform.Service.Switch.UUID,
        new Set([...this.switchChannels.values()].map(channel => channel.hapService)));
    }
  }

  private addButtonChannels(device: HmIPDevice): void {
    const channels = Object.values(device.functionalChannels)
      .filter(isButtonChannel)
      .sort((left, right) => left.index - right.index);
    for (const channel of channels) {
      if (this.buttonChannels.has(channel.index)) {
        continue;
      }

      const subtype = channel.index.toString();
      let hapService = this.accessory.getServiceById(this.platform.Service.StatelessProgrammableSwitch, subtype);
      if (!hapService) {
        const label = channel.label?.trim() || `Button ${channel.index}`;
        hapService = this.accessory.addService(
          new this.platform.Service.StatelessProgrammableSwitch(label, subtype),
        );
      }
      hapService.updateCharacteristic(this.platform.Characteristic.ServiceLabelIndex, channel.index);
      this.buttonChannels.set(channel.index, {hapService, index: channel.index});
      this.platform.log.debug('Added button channel %d to %s', channel.index, this.accessory.displayName);
    }
  }

  private addSwitchChannels(device: HmIPDevice): void {
    const channels = Object.values(device.functionalChannels)
      .filter(isSwitchChannel)
      .sort((left, right) => left.index - right.index);
    for (const channel of channels) {
      if (this.switchChannels.has(channel.index)) {
        continue;
      }

      const subtype = channel.index.toString();
      let hapService = this.accessory.getServiceById(this.platform.Service.Switch, subtype);
      if (!hapService) {
        const label = channel.label?.trim() || `${device.label} Switch`;
        hapService = this.accessory.addService(new this.platform.Service.Switch(label, subtype));
      }
      const runtimeChannel: SwitchRuntimeChannel = {
        hapService,
        index: channel.index,
        on: channel.on ?? false,
      };
      hapService.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => runtimeChannel.on)
        .onSet(value => this.handleSwitchSet(runtimeChannel, value));
      this.switchChannels.set(channel.index, runtimeChannel);
      this.platform.log.debug('Added button actuator channel %d to %s', channel.index, this.accessory.displayName);
    }
  }

  private removeStaleServices(UUID: string, activeServices: ReadonlySet<Service>): void {
    for (const service of [...this.accessory.services]) {
      if (service.UUID === UUID && !activeServices.has(service)) {
        this.accessory.removeService(service);
        this.platform.log.debug('Removed obsolete service %s from %s', service.displayName,
          this.accessory.displayName);
      }
    }
  }

  private async handleSwitchSet(channel: SwitchRuntimeChannel, value: CharacteristicValue): Promise<void> {
    await this.platform.connector.command('device/control/setSwitchState', {
      channelIndex: channel.index,
      deviceId: this.accessory.context.device.id,
      on: Boolean(value),
    });
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (!isSwitchChannel(channel) || channel.on === null) {
        continue;
      }
      const currentChannel = this.switchChannels.get(channel.index);
      if (currentChannel && currentChannel.on !== channel.on) {
        currentChannel.on = channel.on;
        currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.On, currentChannel.on);
      }
    }
  }

  public channelEvent(channelId: number, channelEventType: string): void {
    const channel = this.buttonChannels.get(channelId);
    if (!channel) {
      return;
    }

    let homeKitEvent: number | null = null;
    if (channelEventType === 'KEY_PRESS_SHORT' && channel.lastEvent !== 'KEY_PRESS_LONG_START') {
      homeKitEvent = this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
    } else if (channelEventType === 'KEY_PRESS_LONG_STOP') {
      homeKitEvent = this.platform.Characteristic.ProgrammableSwitchEvent.LONG_PRESS;
    }
    channel.lastEvent = channelEventType;

    if (homeKitEvent !== null) {
      channel.hapService.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
        .sendEventNotification(homeKitEvent);
      this.platform.log.info('%s, Button %d Event: %d', this.accessory.displayName, channelId, homeKitEvent);
    }
  }
}
