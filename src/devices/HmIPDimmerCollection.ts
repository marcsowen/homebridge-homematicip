import type {PlatformAccessory} from 'homebridge';
import type {HmIPDevice, HmIPGroup} from 'homematicip-cloud-client-ts';
import type {HmIPAccessoryRepository} from '../HmIPAccessoryRepository.js';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDeviceAdapter} from '../HmIPTypes.js';
import {getHmIPDimmerChannels, HmIPDimmer} from './HmIPDimmer.js';

interface ChannelAccessory {
  adapter: HmIPDimmer;
  uuid: string;
}

/**
 * Represents one multichannel Homematic IP dimmer as a set of independent
 * HomeKit accessories so each output can be placed in its own room.
 */
export class HmIPDimmerCollection implements HmIPDeviceAdapter {
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
    const dimmerChannels = getHmIPDimmerChannels(device);
    const activeIndexes = new Set(dimmerChannels.map(channel => channel.index));

    for (const [index, channel] of this.channels) {
      if (!activeIndexes.has(index)) {
        channel.adapter.dispose();
        this.accessoryRepository.remove(channel.uuid);
        this.channels.delete(index);
      }
    }

    for (const channel of dimmerChannels) {
      const existing = this.channels.get(channel.index);
      if (existing) {
        existing.adapter.updateDevice(device, this.platform.groups);
        continue;
      }

      const uuid = this.platform.api.hap.uuid.generate(`${device.id}:channel:${channel.index}`);
      const hmIPAccessory = this.accessoryRepository.acquire(uuid, channel.label, device);
      hmIPAccessory.accessory.context.channelIndex = channel.index;
      const adapter = new HmIPDimmer(this.platform, hmIPAccessory.accessory);
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

  public dispose(): void {
    for (const channel of this.channels.values()) {
      channel.adapter.dispose();
    }
    this.channels.clear();
  }
}
