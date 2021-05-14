export interface HmIPStateChangeEvent {
  pushEventType: string;
  device: HmIPDevice | null;
  group: HmIPGroup | null;
  home: HmIPHome | null;
}

export interface HmIPStateChange {
  events: { [key: string]: HmIPStateChangeEvent };
}

export interface HmIPFunctionalChannel {
  functionalChannelType: string;
}

export interface HmIPDevice {
  id: string;
  label: string;
  type: string;
  oem: string;
  modelType: string;
  firmwareVersion: string;
  functionalChannels: { [key: string]: HmIPFunctionalChannel };
  permanentlyReachable: boolean;
  lastStatusUpdate: number;
  homeId: string;
}

export interface HmIPGroup {
  id: string;
  type: string;
}

export interface HmIPHeatingGroup {
  id: string;
  type: string;
  cooling: boolean;
  setPointTemperature: number;
  actualTemperature: number;
  humidity: number;
}

export interface HmIPHome {
  oem: string;
  modelType: string;
  firmwareVersion: string;
  id: string;
  carrierSense: string;
  weather: HmIPWeather;
  location: HmIPLocation;
  connected: boolean;
  currentAPVersion: string;
  availableAPVersion: string;
  timeZoneId: string;
  pinAssigned: boolean;
  dutyCycle: boolean;
  updateState: string;
  powerMeterUnitPrice: number;
  powerMeterUnitCurrency: string;
  deviceUpdateStrategy: string;
  lastReadyForUpdateTimestamp: number;
  apExchangeClientId: string;
  apExchangeState: string;
  accessPointUpdateStates: { [key: string]: HmIPAccessPointUpdateState };
  functionalHomes: { [key: string]: HmIPFunctionalHome };
}

export interface HmIPAccessPointUpdateState {
  accessPointUpdateState: string;
  successfulUpdateTimestamp: number;
  updateStateChangedTimestamp: number;
}

export interface HmIPFunctionalHome {
  solution: string;
  active: boolean;
}

export interface HmIPWeather {
  temperature: number;
  weatherCondition: string;
  weatherDayTime: string;
  minTemperature: number;
  maxTemperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  vaporAmount: number;
}

export interface HmIPLocation {
  city: string;
  latitude: number;
  longtitude: number;
}

export interface HmIPState {
  devices: { [key: string]: HmIPDevice };
  groups: { [key: string]: HmIPGroup };
  home: HmIPHome;
}

export interface SabotageChannel {
  functionalChannelType: string;
  sabotage: boolean;
}

export enum MotionDetectionSendInterval {
  SECONDS_30 = 'SECONDS_30',
  SECONDS_60 = 'SECONDS_60',
  SECONDS_120 = 'SECONDS_120',
  SECONDS_240 = 'SECONDS_240',
  SECONDS_480 = 'SECONDS_480'
}

export interface Updateable {
  updateDevice(device: HmIPDevice, groups: { [key: string]: HmIPGroup }): void;
}
