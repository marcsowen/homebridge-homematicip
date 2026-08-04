import type {Service} from 'homebridge';
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

enum MultiModeInputMode {
  KEY_BEHAVIOR = 'KEY_BEHAVIOR',
  SWITCH_BEHAVIOR = 'SWITCH_BEHAVIOR',
  BINARY_BEHAVIOR = 'BINARY_BEHAVIOR',
}

enum WindowState {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  TILTED = 'TILTED',
}

interface MultiModeInputChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'MULTI_MODE_INPUT_CHANNEL';
  channelRole?: string | null;
  groups?: unknown[];
  index: number;
  label: string | null;
  multiModeInputMode: MultiModeInputMode;
  windowState: WindowState | null;
}

interface RuntimeChannel {
  index: number;
  windowState: WindowState | null;
  contactService?: Service;
  buttonService?: Service;
  lastEvent?: string;
}

export interface HmIPMultiModeInputChannelDescriptor {
  index: number;
  label: string;
}

const inputModes: ReadonlySet<unknown> = new Set(Object.values(MultiModeInputMode));
const windowStates: ReadonlySet<unknown> = new Set(Object.values(WindowState));

function isMultiModeInputChannel(channel: HmIPFunctionalChannel): channel is MultiModeInputChannel {
  if (!hasFunctionalChannelType(channel, 'MULTI_MODE_INPUT_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && typeof candidate.index === 'number'
    && (candidate.label === null || typeof candidate.label === 'string')
    && (candidate.channelRole === undefined || candidate.channelRole === null
      || typeof candidate.channelRole === 'string')
    && (candidate.groups === undefined || Array.isArray(candidate.groups))
    && inputModes.has(candidate.multiModeInputMode)
    && (candidate.windowState === null || windowStates.has(candidate.windowState));
}

function isUnassignedInput(channel: MultiModeInputChannel): boolean {
  return !channel.label?.trim()
    && channel.channelRole === null
    && Array.isArray(channel.groups)
    && channel.groups.length === 0;
}

export function getAssignedMultiModeInputChannels(device: HmIPDevice): HmIPMultiModeInputChannelDescriptor[] {
  return Object.values(device.functionalChannels)
    .filter(isMultiModeInputChannel)
    .filter(channel => !isUnassignedInput(channel))
    .sort((left, right) => left.index - right.index)
    .map(channel => ({
      index: channel.index,
      label: channel.label?.trim() || `${device.label} ${channel.index}`,
    }));
}

/**
 * Homematic IP configurable multichannel inputs.
 *
 * HmIP-FCI6 (Contact Interface flush-mount – 6 channels)
 */
export class HmIPMultiModeInput extends HmIPGenericDevice {
  private readonly channels = new Map<number, RuntimeChannel>();

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);
    this.syncChannels(accessory.context.device);
  }

  private syncChannels(device: HmIPDevice): void {
    const inputChannels = Object.values(device.functionalChannels)
      .filter(isMultiModeInputChannel)
      .filter(channel => !isUnassignedInput(channel))
      .filter(channel => this.accessory.context.channelIndex === undefined
        || channel.index === this.accessory.context.channelIndex)
      .sort((left, right) => left.index - right.index);
    const currentIndexes = new Set(inputChannels.map(channel => channel.index));

    for (const [index, runtimeChannel] of this.channels) {
      if (!currentIndexes.has(index)) {
        this.removeChannelServices(runtimeChannel);
        this.channels.delete(index);
      }
    }

    for (const channel of inputChannels) {
      let runtimeChannel = this.channels.get(channel.index);
      if (!runtimeChannel) {
        runtimeChannel = {
          index: channel.index,
          windowState: channel.windowState,
        };
        this.channels.set(channel.index, runtimeChannel);
      }

      if (channel.multiModeInputMode === MultiModeInputMode.KEY_BEHAVIOR) {
        this.removeContactService(runtimeChannel);
        this.addButtonService(runtimeChannel, channel, device.label);
      } else {
        this.removeButtonService(runtimeChannel);
        this.addContactService(runtimeChannel, channel, device.label);
      }
    }

    this.removeStaleServices(
      this.platform.Service.ContactSensor.UUID,
      new Set([...this.channels.values()].flatMap(channel => channel.contactService ? [channel.contactService] : [])),
    );
    this.removeStaleServices(
      this.platform.Service.StatelessProgrammableSwitch.UUID,
      new Set([...this.channels.values()].flatMap(channel => channel.buttonService ? [channel.buttonService] : [])),
    );
  }

  private addContactService(
    runtimeChannel: RuntimeChannel,
    channel: MultiModeInputChannel,
    deviceLabel: string,
  ): void {
    if (runtimeChannel.contactService) {
      return;
    }
    runtimeChannel.windowState = channel.windowState;
    const label = channel.label?.trim() || `${deviceLabel} ${channel.index}`;
    const service = this.getOrAddService(this.platform.Service.ContactSensor, label, channel.index.toString());
    service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(() => this.getContactState(runtimeChannel));
    runtimeChannel.contactService = service;
  }

  private addButtonService(
    runtimeChannel: RuntimeChannel,
    channel: MultiModeInputChannel,
    deviceLabel: string,
  ): void {
    if (runtimeChannel.buttonService) {
      return;
    }
    const label = channel.label?.trim() || `${deviceLabel} ${channel.index}`;
    const service = this.getOrAddService(
      this.platform.Service.StatelessProgrammableSwitch,
      label,
      channel.index.toString(),
    );
    service.updateCharacteristic(this.platform.Characteristic.ServiceLabelIndex, channel.index);
    runtimeChannel.buttonService = service;
    delete runtimeChannel.lastEvent;
  }

  private removeChannelServices(channel: RuntimeChannel): void {
    this.removeContactService(channel);
    this.removeButtonService(channel);
  }

  private removeContactService(channel: RuntimeChannel): void {
    if (channel.contactService) {
      this.accessory.removeService(channel.contactService);
      delete channel.contactService;
    }
  }

  private removeButtonService(channel: RuntimeChannel): void {
    if (channel.buttonService) {
      this.accessory.removeService(channel.buttonService);
      delete channel.buttonService;
      delete channel.lastEvent;
    }
  }

  private removeStaleServices(UUID: string, activeServices: ReadonlySet<Service>): void {
    for (const service of [...this.accessory.services]) {
      if (service.UUID === UUID && !activeServices.has(service)) {
        this.accessory.removeService(service);
      }
    }
  }

  private getContactState(channel: RuntimeChannel): number {
    if (channel.windowState === null) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return channel.windowState === WindowState.CLOSED
      ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }

  public override updateDevice(device: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void {
    super.updateDevice(device, groups);
    this.syncChannels(device);
    for (const channel of Object.values(device.functionalChannels)) {
      if (!isMultiModeInputChannel(channel)) {
        continue;
      }
      const runtimeChannel = this.channels.get(channel.index);
      if (!runtimeChannel?.contactService || channel.windowState === null
        || channel.windowState === runtimeChannel.windowState) {
        continue;
      }
      runtimeChannel.windowState = channel.windowState;
      runtimeChannel.contactService.updateCharacteristic(
        this.platform.Characteristic.ContactSensorState,
        this.getContactState(runtimeChannel),
      );
    }
  }

  public channelEvent(channelIndex: number, channelEventType: string): void {
    const channel = this.channels.get(channelIndex);
    if (!channel?.buttonService) {
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
      channel.buttonService.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
        .sendEventNotification(homeKitEvent);
    }
  }
}
