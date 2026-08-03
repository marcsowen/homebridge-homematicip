import type {HmIPDevice} from 'homematicip-cloud-client-ts';
import {HmIPBlind} from './devices/HmIPBlind.js';
import {HmIPButton} from './devices/HmIPButton.js';
import {HmIPClimateSensor} from './devices/HmIPClimateSensor.js';
import {HmIPContactSensor} from './devices/HmIPContactSensor.js';
import {HmIPDimmer} from './devices/HmIPDimmer.js';
import {HmIPDoorLockDrive} from './devices/HmIPDoorLockDrive.js';
import {HmIPDoorLockSensor} from './devices/HmIPDoorLockSensor.js';
import {HmIPGarageDoor} from './devices/HmIPGarageDoor.js';
import {HmIPGarageDoorController} from './devices/HmIPGarageDoorController.js';
import {HmIPHeatingThermostat} from './devices/HmIPHeatingThermostat.js';
import {HmIPLightSensor} from './devices/HmIPLightSensor.js';
import {HmIPMotionDetector} from './devices/HmIPMotionDetector.js';
import {HmIPMultiModeInput} from './devices/HmIPMultiModeInput.js';
import {HmIPPresenceDetector} from './devices/HmIPPresenceDetector.js';
import {HmIPRotaryHandleSensor} from './devices/HmIPRotaryHandleSensor.js';
import {HmIPShading} from './devices/HmIPShading.js';
import {HmIPShutter} from './devices/HmIPShutter.js';
import {HmIPSmokeDetector} from './devices/HmIPSmokeDetector.js';
import {HmIPSwitch} from './devices/HmIPSwitch.js';
import {HmIPSwitchMeasuring} from './devices/HmIPSwitchMeasuring.js';
import {HmIPSwitchNotificationLight} from './devices/HmIPSwitchNotificationLight.js';
import {HmIPWallMountedThermostat} from './devices/HmIPWallMountedThermostat.js';
import {HmIPWaterSensor} from './devices/HmIPWaterSensor.js';
import {HmIPWeatherSensor} from './devices/HmIPWeatherSensor.js';
import {HmIPWeatherSensorPlus} from './devices/HmIPWeatherSensorPlus.js';
import {HmIPWeatherSensorPro} from './devices/HmIPWeatherSensorPro.js';
import type {HmIPPlatform} from './HmIPPlatform.js';
import type {HmIPDeviceAdapter, HmIPPlatformAccessory} from './HmIPTypes.js';

const deviceKinds = new Map<string, HmIPDeviceKind>([
  ['TEMPERATURE_HUMIDITY_SENSOR_OUTDOOR', 'climateSensor'],
  ['TEMPERATURE_HUMIDITY_SENSOR_COMPACT', 'climateSensor'],
  ['FULL_FLUSH_SHUTTER', 'shutter'],
  ['BRAND_SHUTTER', 'shutter'],
  ['FULL_FLUSH_BLIND', 'blind'],
  ['BRAND_BLIND', 'blind'],
  ['BLIND_MODULE', 'shading'],
  ['SHUTTER_CONTACT', 'contactSensor'],
  ['SHUTTER_CONTACT_INTERFACE', 'contactSensor'],
  ['SHUTTER_CONTACT_INVISIBLE', 'contactSensor'],
  ['SHUTTER_CONTACT_MAGNETIC', 'contactSensor'],
  ['SHUTTER_CONTACT_OPTICAL_PLUS', 'contactSensor'],
  ['FULL_FLUSH_CONTACT_INTERFACE', 'contactSensor'],
  ['FULL_FLUSH_CONTACT_INTERFACE_6', 'multiModeInput'],
  ['ROTARY_HANDLE_SENSOR', 'rotaryHandleSensor'],
  ['SMOKE_DETECTOR', 'smokeDetector'],
  ['PUSH_BUTTON', 'button'],
  ['PUSH_BUTTON_6', 'button'],
  ['PUSH_BUTTON_6_LED_SWITCH', 'button'],
  ['PUSH_BUTTON_FLAT', 'button'],
  ['BRAND_PUSH_BUTTON', 'button'],
  ['DOOR_BELL_BUTTON', 'button'],
  ['KEY_REMOTE_CONTROL_4', 'button'],
  ['KEY_REMOTE_CONTROL_KEY_MATIC', 'button'],
  ['REMOTE_CONTROL_8', 'button'],
  ['REMOTE_CONTROL_8_MODULE', 'button'],
  ['WIRED_PUSH_BUTTON_2', 'button'],
  ['WIRED_PUSH_BUTTON_6', 'button'],
  ['PLUGABLE_SWITCH', 'switch'],
  ['FULL_FLUSH_INPUT_SWITCH', 'switch'],
  ['CARBON_DIOXIDE_SENSOR', 'switch'],
  ['MOTION_DETECTOR_SWITCH_OUTDOOR', 'switch'],
  ['BRAND_SWITCH_2', 'switch'],
  ['PRINTED_CIRCUIT_BOARD_SWITCH_BATTERY', 'switch'],
  ['PRINTED_CIRCUIT_BOARD_SWITCH_2', 'switch'],
  ['OPEN_COLLECTOR_8_MODULE', 'switch'],
  ['HEATING_SWITCH_2', 'switch'],
  ['WIRED_SWITCH_8', 'switch'],
  ['WIRED_SWITCH_4', 'switch'],
  ['WIRED_INPUT_SWITCH_6', 'switch'],
  ['DIN_RAIL_SWITCH', 'switch'],
  ['DIN_RAIL_SWITCH_4', 'switch'],
  ['STATUS_BOARD_8', 'switch'],
  ['MULTI_IO_BOX', 'switch'],
  ['SWITCH_POWER_SUPPLY', 'switch'],
  ['PLUGABLE_SWITCH_MEASURING', 'switchMeasuring'],
  ['BRAND_SWITCH_MEASURING', 'switchMeasuring'],
  ['FULL_FLUSH_SWITCH_MEASURING', 'switchMeasuring'],
  ['SWITCH_MEASURING_CABLE_INDOOR', 'switchMeasuring'],
  ['SWITCH_MEASURING_CABLE_OUTDOOR', 'switchMeasuring'],
  ['USB_SWITCH_MEASURING', 'switchMeasuring'],
  ['TORMATIC_MODULE', 'garageDoor'],
  ['HOERMANN_DRIVES_MODULE', 'garageDoor'],
  ['WALL_MOUNTED_GARAGE_DOOR_CONTROLLER', 'garageDoorController'],
  ['WATER_SENSOR', 'waterSensor'],
  ['LIGHT_SENSOR', 'lightSensor'],
  ['MOTION_DETECTOR_INDOOR', 'motionDetector'],
  ['MOTION_DETECTOR_OUTDOOR', 'motionDetector'],
  ['MOTION_DETECTOR_PUSH_BUTTON', 'motionDetector'],
  ['PRESENCE_DETECTOR_INDOOR', 'presenceDetector'],
  ['BRAND_DIMMER', 'dimmer'],
  ['FULL_FLUSH_DIMMER', 'dimmer'],
  ['PLUGGABLE_DIMMER', 'dimmer'],
  ['WIRED_DIMMER_3', 'dimmer'],
  ['DIN_RAIL_DIMMER_3', 'dimmer'],
  ['DOOR_LOCK_DRIVE', 'doorLockDrive'],
  ['DOOR_LOCK_SENSOR', 'doorLockSensor'],
  ['BRAND_SWITCH_NOTIFICATION_LIGHT', 'switchNotificationLight'],
  ['WEATHER_SENSOR', 'weatherSensor'],
  ['WEATHER_SENSOR_PLUS', 'weatherSensorPlus'],
  ['WEATHER_SENSOR_PRO', 'weatherSensorPro'],
]);

const controllerDeviceTypes = new Set([
  'ACCESS_POINT',
  'HOME_CONTROL_ACCESS_POINT',
  'WIRELESS_ACCESS_POINT_BASIC',
]);

const externalDeviceTypes = new Set([
  'EXTERNAL',
  'PLUGIN_EXTERNAL',
]);

export type HmIPDeviceKind =
  | 'heatingThermostat'
  | 'wallMountedThermostat'
  | 'climateSensor'
  | 'shutter'
  | 'blind'
  | 'shading'
  | 'contactSensor'
  | 'rotaryHandleSensor'
  | 'smokeDetector'
  | 'button'
  | 'switch'
  | 'switchMeasuring'
  | 'garageDoor'
  | 'garageDoorController'
  | 'waterSensor'
  | 'lightSensor'
  | 'motionDetector'
  | 'multiModeInput'
  | 'presenceDetector'
  | 'dimmer'
  | 'doorLockDrive'
  | 'doorLockSensor'
  | 'switchNotificationLight'
  | 'weatherSensor'
  | 'weatherSensorPlus'
  | 'weatherSensorPro';

export function getHmIPDeviceKind(device: HmIPDevice): HmIPDeviceKind | undefined {
  if (HmIPHeatingThermostat.isHeatingThermostat(device.type)) {
    return 'heatingThermostat';
  }
  if (HmIPHeatingThermostat.isThermostat(device.type)) {
    return deviceKinds.get(device.type) ?? 'wallMountedThermostat';
  }
  return deviceKinds.get(device.type);
}

export function isHmIPControllerDevice(device: Pick<HmIPDevice, 'type'>): boolean {
  return controllerDeviceTypes.has(device.type);
}

export function isHmIPExternalDevice(device: Pick<HmIPDevice, 'type'>): boolean {
  return externalDeviceTypes.has(device.type);
}

export class HmIPDeviceFactory {
  public constructor(private readonly platform: HmIPPlatform) {}

  public create(device: HmIPDevice, accessory: HmIPPlatformAccessory): HmIPDeviceAdapter | undefined {
    const kind = getHmIPDeviceKind(device);
    const adapter = this.createAdapter(kind, accessory);
    adapter?.updateDevice(device, this.platform.groups);
    return adapter;
  }

  private createAdapter(
    kind: HmIPDeviceKind | undefined,
    accessory: HmIPPlatformAccessory,
  ): HmIPDeviceAdapter | undefined {
    switch (kind) {
      case 'heatingThermostat': return new HmIPHeatingThermostat(this.platform, accessory);
      case 'wallMountedThermostat':
        return accessory.context.config?.asClimateSensor === true
          ? new HmIPClimateSensor(this.platform, accessory)
          : new HmIPWallMountedThermostat(this.platform, accessory);
      case 'climateSensor': return new HmIPClimateSensor(this.platform, accessory);
      case 'shutter': return new HmIPShutter(this.platform, accessory);
      case 'blind': return new HmIPBlind(this.platform, accessory);
      case 'shading': return new HmIPShading(this.platform, accessory);
      case 'contactSensor': return new HmIPContactSensor(this.platform, accessory);
      case 'rotaryHandleSensor': return new HmIPRotaryHandleSensor(this.platform, accessory);
      case 'smokeDetector': return new HmIPSmokeDetector(this.platform, accessory);
      case 'button': return new HmIPButton(this.platform, accessory);
      case 'switch': return new HmIPSwitch(this.platform, accessory);
      case 'switchMeasuring': return new HmIPSwitchMeasuring(this.platform, accessory);
      case 'garageDoor': return new HmIPGarageDoor(this.platform, accessory);
      case 'garageDoorController': return new HmIPGarageDoorController(this.platform, accessory);
      case 'waterSensor': return new HmIPWaterSensor(this.platform, accessory);
      case 'lightSensor': return new HmIPLightSensor(this.platform, accessory);
      case 'motionDetector': return new HmIPMotionDetector(this.platform, accessory);
      case 'multiModeInput': return new HmIPMultiModeInput(this.platform, accessory);
      case 'presenceDetector': return new HmIPPresenceDetector(this.platform, accessory);
      case 'dimmer': return new HmIPDimmer(this.platform, accessory);
      case 'doorLockDrive': return new HmIPDoorLockDrive(this.platform, accessory);
      case 'doorLockSensor': return new HmIPDoorLockSensor(this.platform, accessory);
      case 'switchNotificationLight': return new HmIPSwitchNotificationLight(this.platform, accessory);
      case 'weatherSensor': return new HmIPWeatherSensor(this.platform, accessory);
      case 'weatherSensorPlus': return new HmIPWeatherSensorPlus(this.platform, accessory);
      case 'weatherSensorPro': return new HmIPWeatherSensorPro(this.platform, accessory);
      case undefined: return undefined;
    }
  }
}
