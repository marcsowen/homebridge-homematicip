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

export interface HmIPPlatformConfig extends PlatformConfig {
  access_point: string;
  auth_token?: string;
  pin?: string;
  devices?: Record<string, HmIPDeviceConfig>;
}
