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

export type HmIPDeviceConfigs = Record<string, HmIPDeviceConfig> | HmIPDeviceConfigEntry[];

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
  if (Array.isArray(devices)) {
    return devices.find(device => device.id === deviceId);
  }
  return devices?.[deviceId];
}
