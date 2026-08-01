export interface IdentifiableDevice {
  id: string;
}

export type HmIPStateChangeEvent =
  | {pushEventType: 'GROUP_CHANGED' | 'GROUP_ADDED' | 'GROUP_REMOVED'; group: HmIPGroup}
  | {pushEventType: 'DEVICE_ADDED' | 'DEVICE_CHANGED'; device: HmIPDevice}
  | {pushEventType: 'DEVICE_REMOVED'; device: Pick<HmIPDevice, 'id' | 'modelType'>}
  | {
    pushEventType: 'DEVICE_CHANNEL_EVENT';
    deviceId: string;
    channelIndex: number;
    channelEventType: string;
  }
  | {pushEventType: 'HOME_CHANGED'; home: HmIPHome}
  | {pushEventType: 'SECURITY_JOURNAL_CHANGED'; data: Readonly<Record<string, unknown>>}
  | {pushEventType: 'UNKNOWN'; sourcePushEventType: string; data: Readonly<Record<string, unknown>>};

export interface HmIPStateChange {
  events: Record<string, HmIPStateChangeEvent>;
}

export interface HmIPFunctionalChannel {
  functionalChannelType: string;
}

export interface HmIPDevice extends IdentifiableDevice {
  label: string;
  type: string;
  /** Not supplied for devices with the EXTERNAL archetype. */
  oem?: string;
  modelType: string;
  firmwareVersion: string;
  functionalChannels: Record<string, HmIPFunctionalChannel>;
  permanentlyReachable: boolean;
  lastStatusUpdate: number;
  homeId: string;
}

export interface HmIPGroup extends IdentifiableDevice {
  type: string;
}

export interface HmIPHeatingGroup extends HmIPGroup {
  type: 'HEATING';
  cooling: boolean | null;
  setPointTemperature: number | null;
  actualTemperature: number | null;
  humidity: number | null;
  minTemperature: number | null;
  maxTemperature: number | null;
  controlMode: string | null;
  valvePosition: number | null;
}

export interface HmIPSecurityZoneGroup extends HmIPGroup {
  type: 'SECURITY_ZONE';
  label: string;
  /** Omitted for disarmed zones in request-based security installations. */
  active?: boolean;
}

export interface HmIPHome extends IdentifiableDevice {
  currentAPVersion: string;
  functionalHomes: Record<string, HmIPFunctionalHome>;
}

export interface HmIPFunctionalHome {
  solution: string;
  active: boolean;
}

export interface HmIPSecurityAndAlarmSolution extends HmIPFunctionalHome {
  solution: 'SECURITY_AND_ALARM';
  activationInProgress: boolean;
  intrusionAlarmActive: boolean;
  safetyAlarmActive: boolean;
  alarmActive: boolean;
}

export interface HmIPState {
  devices: Record<string, HmIPDevice>;
  groups: Record<string, HmIPGroup>;
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

export type HmIPParseResult<T> =
  | {success: true; value: T}
  | {success: false; error: string};

export function isHmIPRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHmIPFunctionalChannel(value: unknown): value is HmIPFunctionalChannel {
  return isHmIPRecord(value) && typeof value.functionalChannelType === 'string';
}

export function hasFunctionalChannelType<const T extends readonly string[]>(
  channel: HmIPFunctionalChannel,
  ...types: T
): channel is HmIPFunctionalChannel & {functionalChannelType: T[number]} {
  return types.includes(channel.functionalChannelType);
}

export function isHmIPDevice(value: unknown): value is HmIPDevice {
  return isHmIPRecord(value)
    && typeof value.id === 'string'
    && typeof value.type === 'string'
    && typeof value.label === 'string'
    && (value.type === 'EXTERNAL' || typeof value.oem === 'string')
    && typeof value.modelType === 'string'
    && typeof value.firmwareVersion === 'string'
    && typeof value.permanentlyReachable === 'boolean'
    && typeof value.lastStatusUpdate === 'number'
    && typeof value.homeId === 'string'
    && isHmIPRecord(value.functionalChannels)
    && Object.values(value.functionalChannels).every(isHmIPFunctionalChannel);
}

export function isHmIPHome(value: unknown): value is HmIPHome {
  return isHmIPRecord(value)
    && typeof value.id === 'string'
    && typeof value.currentAPVersion === 'string'
    && isHmIPRecord(value.functionalHomes)
    && Object.values(value.functionalHomes).every(functionalHome =>
      isHmIPRecord(functionalHome)
      && typeof functionalHome.solution === 'string'
      && typeof functionalHome.active === 'boolean');
}

function isHmIPGroup(value: unknown): value is HmIPGroup {
  return isHmIPRecord(value) && typeof value.id === 'string' && typeof value.type === 'string';
}

export function isHmIPHeatingGroup(value: HmIPGroup): value is HmIPHeatingGroup {
  if (value.type !== 'HEATING') {
    return false;
  }
  const candidate: unknown = value;
  return isHmIPRecord(candidate)
    && (candidate.cooling === null || typeof candidate.cooling === 'boolean')
    && (candidate.setPointTemperature === null || typeof candidate.setPointTemperature === 'number')
    && (candidate.actualTemperature === null || typeof candidate.actualTemperature === 'number')
    && (candidate.humidity === null || typeof candidate.humidity === 'number')
    && (candidate.minTemperature === null || typeof candidate.minTemperature === 'number')
    && (candidate.maxTemperature === null || typeof candidate.maxTemperature === 'number')
    && (candidate.controlMode === null || typeof candidate.controlMode === 'string')
    && (candidate.valvePosition === null || typeof candidate.valvePosition === 'number');
}

export function isHmIPSecurityZoneGroup(value: HmIPGroup): value is HmIPSecurityZoneGroup {
  const candidate: unknown = value;
  return value.type === 'SECURITY_ZONE'
    && isHmIPRecord(candidate)
    && typeof candidate.label === 'string'
    && (candidate.active === undefined || typeof candidate.active === 'boolean');
}

export function isHmIPSecurityAndAlarmSolution(
  value: HmIPFunctionalHome,
): value is HmIPSecurityAndAlarmSolution {
  const candidate: unknown = value;
  return value.solution === 'SECURITY_AND_ALARM'
    && isHmIPRecord(candidate)
    && typeof candidate.activationInProgress === 'boolean'
    && typeof candidate.intrusionAlarmActive === 'boolean'
    && typeof candidate.safetyAlarmActive === 'boolean'
    && typeof candidate.alarmActive === 'boolean';
}

export function isHmIPState(value: unknown): value is HmIPState {
  return parseHmIPState(value).success;
}

export function parseHmIPState(value: unknown): HmIPParseResult<HmIPState> {
  if (!isHmIPRecord(value) || !isHmIPRecord(value.devices)
    || !isHmIPRecord(value.groups) || !isHmIPRecord(value.home)) {
    return {success: false, error: 'response must contain devices, groups, and home objects'};
  }

  if (!isHmIPHome(value.home)) {
    return {success: false, error: 'home is invalid'};
  }

  for (const [id, device] of Object.entries(value.devices)) {
    if (!isHmIPDevice(device)) {
      return {success: false, error: `device ${id} is invalid`};
    }
  }

  for (const [id, group] of Object.entries(value.groups)) {
    if (!isHmIPGroup(group)) {
      return {success: false, error: `group ${id} is invalid`};
    }
  }

  return {success: true, value: value as unknown as HmIPState};
}

export function parseHmIPStateChange(value: unknown): HmIPParseResult<HmIPStateChange> {
  if (!isHmIPRecord(value) || !isHmIPRecord(value.events)) {
    return {success: false, error: 'websocket payload must contain an events object'};
  }

  const events: Record<string, HmIPStateChangeEvent> = {};
  for (const [id, candidate] of Object.entries(value.events)) {
    if (!isHmIPRecord(candidate) || typeof candidate.pushEventType !== 'string') {
      return {success: false, error: `event ${id}: pushEventType must be a string`};
    }

    switch (candidate.pushEventType) {
      case 'GROUP_CHANGED':
      case 'GROUP_ADDED':
      case 'GROUP_REMOVED':
        if (!isHmIPGroup(candidate.group)) {
          return {success: false, error: `event ${id}: ${candidate.pushEventType}.group is invalid`};
        }
        events[id] = {pushEventType: candidate.pushEventType, group: candidate.group};
        break;
      case 'DEVICE_ADDED':
      case 'DEVICE_CHANGED':
        if (!isHmIPDevice(candidate.device)) {
          return {success: false, error: `event ${id}: ${candidate.pushEventType}.device is invalid`};
        }
        events[id] = {pushEventType: candidate.pushEventType, device: candidate.device};
        break;
      case 'DEVICE_REMOVED':
        if (!isHmIPRecord(candidate.device)
          || typeof candidate.device.id !== 'string'
          || typeof candidate.device.modelType !== 'string') {
          return {success: false, error: `event ${id}: DEVICE_REMOVED.device is invalid`};
        }
        events[id] = {
          pushEventType: candidate.pushEventType,
          device: {id: candidate.device.id, modelType: candidate.device.modelType},
        };
        break;
      case 'DEVICE_CHANNEL_EVENT':
        if (typeof candidate.deviceId !== 'string'
          || (candidate.channelIndex != null && typeof candidate.channelIndex !== 'number')
          || (candidate.channelEventType != null && typeof candidate.channelEventType !== 'string')) {
          return {success: false, error: `event ${id}: DEVICE_CHANNEL_EVENT fields are invalid`};
        }
        events[id] = {
          pushEventType: candidate.pushEventType,
          deviceId: candidate.deviceId,
          channelIndex: candidate.channelIndex ?? 1,
          channelEventType: candidate.channelEventType ?? '',
        };
        break;
      case 'HOME_CHANGED':
        if (!isHmIPHome(candidate.home)) {
          return {success: false, error: `event ${id}: HOME_CHANGED.home is invalid`};
        }
        events[id] = {pushEventType: candidate.pushEventType, home: candidate.home};
        break;
      case 'SECURITY_JOURNAL_CHANGED':
        events[id] = {pushEventType: candidate.pushEventType, data: candidate};
        break;
      default:
        events[id] = {
          pushEventType: 'UNKNOWN',
          sourcePushEventType: candidate.pushEventType,
          data: candidate,
        };
    }
  }

  return {success: true, value: {events}};
}

export function isHmIPStateChange(value: unknown): boolean {
  return parseHmIPStateChange(value).success;
}
