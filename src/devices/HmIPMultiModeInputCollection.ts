import type {PlatformAccessory} from 'homebridge';
import type {HmIPDevice, HmIPGroup} from 'homematicip-cloud-client-ts';
import type {HmIPAccessoryRepository} from '../HmIPAccessoryRepository.js';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDeviceAdapter} from '../HmIPTypes.js';
import {
  getAssignedMultiModeInputChannels,
  HmIPMultiModeInput,
} from './HmIPMultiModeInput.js';

interface ChannelAccessory {
  adapter: HmIPMultiModeInput;
  uuid: string;
}

/**
 * Represents one Homematic IP multi-mode input device as a set of independent
 * HomeKit accessories so each assigned channel can be placed in its own room.
 */
export class HmIPMultiModeInputCollection implements HmIPDeviceAdapter {
  private readonly channels = new Map<number, ChannelAccessory>();

  public constructor(
    private readonly platform: HmIPPlatform,
    private readonly accessoryRepository: HmIPAccessoryRepository,
    device: HmIPDevice,
  ) {
    this.syncChannels(device);
  }

  public get accessories(): readonly PlatformAccessory[] {
    return [...this.channels.values()].map(channel => channel.adapter.accessory);
  }

  public get hasFunctionalServices(): boolean {
    return this.channels.size > 0;
  }

  public readonly hidden = false;

  private syncChannels(device: HmIPDevice): void {
    const assignedChannels = getAssignedMultiModeInputChannels(device);
    const assignedIndexes = new Set(assignedChannels.map(channel => channel.index));

    for (const [index, channel] of this.channels) {
      if (!assignedIndexes.has(index)) {
        channel.adapter.dispose();
        this.accessoryRepository.remove(channel.uuid);
        this.channels.delete(index);
      }
    }

    for (const channel of assignedChannels) {
      const existing = this.channels.get(channel.index);
      if (existing) {
        existing.adapter.updateDevice(device, this.platform.groups);
        continue;
      }

      const uuid = this.platform.api.hap.uuid.generate(`${device.id}:channel:${channel.index}`);
      const hmIPAccessory = this.accessoryRepository.acquire(uuid, channel.label, device);
      hmIPAccessory.accessory.context.channelIndex = channel.index;
      const adapter = new HmIPMultiModeInput(this.platform, hmIPAccessory.accessory);
      if (!adapter.hasFunctionalServices || adapter.hidden) {
        adapter.dispose();
        this.accessoryRepository.remove(uuid);
        continue;
      }

      this.channels.set(channel.index, {adapter, uuid});
      this.accessoryRepository.register(hmIPAccessory);
    }
  }

  public updateDevice(device: HmIPDevice, _groups: Readonly<Record<string, HmIPGroup>>): void {
    this.syncChannels(device);
  }

  public channelEvent(channelId: number, channelEventType: string): void {
    this.channels.get(channelId)?.adapter.channelEvent(channelId, channelEventType);
  }

  public dispose(): void {
    for (const channel of this.channels.values()) {
      channel.adapter.dispose();
    }
    this.channels.clear();
  }
}
