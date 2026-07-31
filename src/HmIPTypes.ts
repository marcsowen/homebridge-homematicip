import type {PlatformAccessory} from 'homebridge';
import type {HmIPDeviceConfig} from './HmIPConfig.js';
import type {HmIPDevice, HmIPGroup, IdentifiableDevice} from './HmIPState.js';

export type HmIPAccessoryContext<T extends IdentifiableDevice = HmIPDevice> = {
  config?: HmIPDeviceConfig;
  device: T;
};

export type HmIPPlatformAccessory<T extends IdentifiableDevice = HmIPDevice> =
  PlatformAccessory<HmIPAccessoryContext<T>>;

export interface HmIPDeviceAdapter {
  readonly accessory: PlatformAccessory;
  readonly hidden: boolean;
  updateDevice(device: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void;
  channelEvent?(channelId: number, channelEventType: string): void;
  dispose(): void;
}

export function isHmIPAccessoryContext(value: unknown): value is HmIPAccessoryContext<IdentifiableDevice> {
  if (typeof value !== 'object' || value === null || !('device' in value)) {
    return false;
  }
  const device = value.device;
  return typeof device === 'object' && device !== null && 'id' in device && typeof device.id === 'string';
}
