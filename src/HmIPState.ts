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
}

export interface HmIPAccessPointUpdateState {
  accessPointUpdateState: string;
  successfulUpdateTimestamp: number;
  updateStateChangedTimestamp: number;
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

export interface Updateable {
  updateDevice(home: HmIPHome, device: HmIPDevice, groups: { [key: string]: HmIPGroup }): void;
}
