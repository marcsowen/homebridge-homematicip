import type {PlatformConfig} from 'homebridge';

export interface HmIPDeviceConfig {
  asClimateSensor?: boolean;
  hide?: boolean;
  lightSensor?: boolean;
  lightSwitch?: boolean;
  openLatch?: boolean;
  pin?: string;
  separateChannels?: boolean;
  simpleSwitch?: boolean;
  withRainSensor?: boolean;
  withStormSensor?: boolean;
  withSunshineSensor?: boolean;
  withWindSpeedSensor?: boolean;
}

export interface HmIPDeviceConfigEntry extends HmIPDeviceConfig {
  id: string;
}

export type HmIPDeviceConfigs = HmIPDeviceConfigEntry[];

export interface HmIPPlatformConfig extends PlatformConfig {
  access_point: string;
  auth_token?: string;
  hideSecuritySystem?: boolean;
  pin?: string;
  devices?: HmIPDeviceConfigs;
}

export function getDeviceConfig(
  devices: HmIPDeviceConfigs | undefined,
  deviceId: string,
): HmIPDeviceConfig | undefined {
  const entry = devices?.find(device => device.id === deviceId);
  if (!entry) {
    return undefined;
  }
  const {id: _id, ...deviceConfig} = entry;
  return deviceConfig;
}

export function hasLegacyDeviceConfig(devices: unknown): boolean {
  return devices !== undefined && !Array.isArray(devices);
}
