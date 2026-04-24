import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import {HmIPConnector} from './HmIPConnector.js';
import {PLATFORM_NAME, PLUGIN_NAME, PLUGIN_VERSION} from './settings.js';
import {HmIPDevice, HmIPGroup, HmIPHome, HmIPState, HmIPStateChange, IdentifiableDevice, Updateable, EventUpdateable} from './HmIPState.js';
import {HmIPShutter} from './devices/HmIPShutter.js';
import {HmIPHeatingThermostat} from './devices/HmIPHeatingThermostat.js';
import {HmIPContactSensor} from './devices/HmIPContactSensor.js';
import {HmIPGenericDevice} from './devices/HmIPGenericDevice.js';
import {HmIPAccessory} from './HmIPAccessory.js';
import {HmIPWallMountedThermostat} from './devices/HmIPWallMountedThermostat.js';
import * as os from 'os';
import {HmIPSmokeDetector} from './devices/HmIPSmokeDetector.js';
import {HmIPButton} from './devices/HmIPButton.js';
import {HmIPSwitch} from './devices/HmIPSwitch.js';
import {HmIPGarageDoor} from './devices/HmIPGarageDoor.js';
import {HmIPGarageDoorController} from './devices/HmIPGarageDoorController.js';
import {HmIPClimateSensor} from './devices/HmIPClimateSensor.js';
import {HmIPWaterSensor} from './devices/HmIPWaterSensor.js';
import {HmIPBlind} from './devices/HmIPBlind.js';
import {HmIPSwitchMeasuring} from './devices/HmIPSwitchMeasuring.js';
import {CustomCharacteristic} from './CustomCharacteristic.js';
import {HmIPLightSensor} from './devices/HmIPLightSensor.js';
import {HmIPSecuritySystem} from './HmIPSecuritySystem.js';
import {HmIPRotaryHandleSensor} from './devices/HmIPRotaryHandleSensor.js';
import {HmIPMotionDetector} from './devices/HmIPMotionDetector.js';
import {HmIPPresenceDetector} from './devices/HmIPPresenceDetector.js';
import {HmIPDimmer} from './devices/HmIPDimmer.js';
import {HmIPDimmerMultiChannel} from './devices/HmIPDimmerMultiChannel.js';
import fakegato from 'fakegato-history';
import {HmIPDoorLockDrive} from './devices/HmIPDoorLockDrive.js';
import {HmIPDoorLockSensor} from './devices/HmIPDoorLockSensor.js';
import {HmIPSwitchNotificationLight} from './devices/HmIPSwitchNotificationLight.js';
import {HmIPWeatherSensor} from './devices/HmIPWeatherSensor.js';
import {HmIPWeatherSensorPlus} from './devices/HmIPWeatherSensorPlus.js';
import {HmIPWeatherSensorPro} from './devices/HmIPWeatherSensorPro.js';

/**
 * HomematicIP platform
 */
export class HmIPPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly FakeGatoHistoryService: typeof fakegato;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly connector: HmIPConnector;
  public groups!: { [key: string]: HmIPGroup };
  private deviceMap = new Map();
  public customCharacteristic: CustomCharacteristic;

  public securitySystem: HmIPSecuritySystem | undefined;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.info('%s v%s', PLUGIN_NAME, PLUGIN_VERSION);

    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.FakeGatoHistoryService = fakegato(this.api);
    this.customCharacteristic = new CustomCharacteristic(api);

    this.connector = new HmIPConnector(
      log,
      config['access_point'],
      config['auth_token'],
      config['pin'],
    );
    if (!this.connector.isReadyForUse() && !this.connector.isReadyForPairing()) {
      log.error('Please configure \'access_point\' in \'config.json\' (sticker on the back) and make ' +
        'sure the Access Point is glowing blue.');
      return;
    }
    this.log.debug('Finished initializing platform:', this.config.name);
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      if (!this.connector.isReadyForUse()) {
        this.startPairing(config['access_point']);
      } else {
        this.discoverDevices();
      }
    });
    this.api.on('shutdown', () => {
      log.debug('Executed shutdown callback');
      this.connector.disconnectWs();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    if (this.connector.isReadyForUse() && !this.getAccessory(accessory.UUID)) {
      this.log.info('Loading accessory from cache:', accessory.displayName);
      this.accessories.push(accessory);
    }
  }

  async startPairing(accessPointId: string) {
    if (!(await this.connector.init()).valueOf()) {
      return;
    }
    const uuid = this.api.hap.uuid.generate(PLUGIN_NAME + '_' + os.hostname());
    if (!(await this.connector.authConnectionRequest(uuid))) {
      this.log.error('Cannot start auth request for access_point=' + accessPointId);
      return;
    }
    const sleep = (waitTimeInMs: number) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));
    do {
      this.log.info('Press blue, glowing link button of HmIP Access Point now!');
      await sleep(5000);
    } while (!(await this.connector.authRequestAcknowledged(uuid))); // response code: 400 Bad Request

    const authTokenResponse = await this.connector.authRequestToken(uuid);
    if (!authTokenResponse || !authTokenResponse.authToken) {
      this.log.error('Cannot request auth token for access_point=' + accessPointId);
      return;
    }

    const confirmResponse = await this.connector.authConfirmToken(uuid, authTokenResponse.authToken);
    if (!confirmResponse || !confirmResponse.clientId) {
      this.log.error('Cannot confirm auth token for access_point=' + accessPointId + ', authToken=' + authTokenResponse.authToken);
      return;
    }
    this.log.info('SUCCESS! Your auth_token is: ' + authTokenResponse.authToken + ' (Access Point ID: '
      + accessPointId + ', Client ID: ' + confirmResponse.clientId + '). Update \'auth_token\' in config and restart.'
      + 'We recommend removing \'pin\' from config again.');
  }

  /**
   * Register discovered Homematic IP accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    if (!(await this.connector.init()).valueOf()) {
      return;
    }

    const hmIPState = <HmIPState>await this.connector.apiCall('home/getCurrentState', this.connector.clientCharacteristics, 1);
    if (!hmIPState || !hmIPState.devices) {
      this.log.info(`HomematicIP response is incomplete or could not be parsed: ${hmIPState}`);
      return;
    }

    this.groups = hmIPState.groups;
    // this.setHome(hmIPState.home);

    // loop over the discovered devices and register each one if it has not already been registered
    for (const id in hmIPState.devices) {
      const device = hmIPState.devices[id];
      this.updateAccessory(id, device);
    }

    // find cached but now removed accessories and unregister them
    const accessoriesToBeRemoved: PlatformAccessory[] = [];

    this.securitySystem = this.createSecuritySystem(hmIPState.home);
    const homeSecuritySystemUuid = this.api.hap.uuid.generate(hmIPState.home.id + '_security');

    if (this.securitySystem.hidden) {
      const cachedAccessory = this.getAccessory(homeSecuritySystemUuid);
      if (cachedAccessory !== undefined) {
        this.log.info('Removing home security system');
        accessoriesToBeRemoved.push(cachedAccessory);
      }
    }

    for (const cachedAccessory of this.accessories) {
      if (cachedAccessory.UUID !== homeSecuritySystemUuid && !this.deviceMap.has(cachedAccessory.context.device.id)) {
        this.log.info('Removing accessory %s', cachedAccessory.context.device.label);
        accessoriesToBeRemoved.push(cachedAccessory);
      }
    }

    if (accessoriesToBeRemoved.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToBeRemoved);
    }

    // Start websocket immediately and register handlers
    await this.connector.connectWs(data => {
      const stateChange = <HmIPStateChange>JSON.parse(data.toString());
      let securityZoneChanged = false;
      for (const id in stateChange.events) {
        const event = stateChange.events[id];
        switch (event.pushEventType) {
          case 'GROUP_CHANGED':
          case 'GROUP_ADDED':
            if (event.group) {
              this.log.debug(`${event.pushEventType}: ${event.group.id} ${JSON.stringify(event.group)}`);
              hmIPState.groups[event.group.id] = event.group;
              this.groups[event.group.id] = event.group;
              if (event.group.type === 'SECURITY_ZONE') {
                securityZoneChanged = true;
              }
            }
            break;
          case 'GROUP_REMOVED':
            if (event.group) {
              this.log.debug(`${event.pushEventType}: ${event.group.id}`);
              delete hmIPState.groups[event.group.id];
              delete this.groups[event.group.id];
            }
            break;
          case 'DEVICE_REMOVED':
            if (event.device) {
              this.log.debug(`${event.pushEventType}: ${event.device.id} ${event.device.modelType}`);
              const hmIPDevice: HmIPGenericDevice | null = this.deviceMap.get(event.device.id);
              if (hmIPDevice) {
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [hmIPDevice.accessory]);
                delete hmIPState.devices[event.device.id];
                this.deviceMap.delete(event.device.id);
              } else {
                this.log.debug('Removal event from unregistered device: ' + event.device.id);
              }
            }
            break;
          case 'DEVICE_CHANGED':
          case 'DEVICE_ADDED':
            if (event.device) {
              this.log.debug(`${event.pushEventType}: ${event.device.id} ${event.device.modelType}`);
              if (this.deviceMap.has(event.device.id)) {
                (<Updateable>this.deviceMap.get(event.device.id)).updateDevice(event.device, this.groups);
              } else {
                this.log.debug('Device add/change event from unregistered device: ' + event.device.id);
              }
            }
            break;
          case 'DEVICE_CHANNEL_EVENT':
            if (this.deviceMap.has(event.deviceId)) {
              this.log.debug(`Channel Event: ${JSON.stringify(event)}`);
              const hmIPDevice = <EventUpdateable>this.deviceMap.get(event.deviceId);
	      if (typeof hmIPDevice.channelEvent === 'function') {
                const ch_id = (event.channelIndex ? event.channelIndex : 1);
		const ch_type = (event.channelEventType ? event.channelEventType : "");
                hmIPDevice.channelEvent(ch_id, ch_type);
              }
            } else {
              this.log.debug('Device channel event from unregistered device: ' + event.deviceId);
            }
            break;
          case 'HOME_CHANGED':
            if (event.home) {
              this.log.debug(`${event.pushEventType}: ${event.home.id} ${JSON.stringify(event.home)}`);
              this.securitySystem?.updateHome(event.home);
            }
            break;
          case 'SECURITY_JOURNAL_CHANGED':
            this.log.debug(`${event.pushEventType}: ${JSON.stringify(event)}`);
            break;
          default:
            this.log.debug(`Unhandled event type: ${event.pushEventType} group=${event.group} device=${event.device}`);
        }
      }

      if (securityZoneChanged) {
        this.securitySystem?.updateGroups(this.groups);
      }
    });
  }

  private updateAccessory(id: string, device: HmIPDevice) {
    const uuid = this.api.hap.uuid.generate(id);
    const hmIPAccessory = this.createAccessory(uuid, device.label, device);
    let homebridgeDevice: HmIPGenericDevice | null = null;
    if (HmIPHeatingThermostat.isHeatingThermostat(device.type)) {
      homebridgeDevice = new HmIPHeatingThermostat(this, hmIPAccessory.accessory);
    } else if (HmIPHeatingThermostat.isThermostat(device.type)) {
      const asClimateSensor = hmIPAccessory.accessory.context.config?.['asClimateSensor'] === true;
      if (asClimateSensor) {
        homebridgeDevice = new HmIPClimateSensor(this, hmIPAccessory.accessory);
      } else {
        homebridgeDevice = new HmIPWallMountedThermostat(this, hmIPAccessory.accessory);
      }
    } else if (device.type === 'TEMPERATURE_HUMIDITY_SENSOR_OUTDOOR'
      || device.type === 'TEMPERATURE_HUMIDITY_SENSOR_COMPACT') {
      homebridgeDevice = new HmIPClimateSensor(this, hmIPAccessory.accessory);
    } else if (device.type === 'FULL_FLUSH_SHUTTER'
      || device.type === 'BRAND_SHUTTER') {
      homebridgeDevice = new HmIPShutter(this, hmIPAccessory.accessory);
    } else if (device.type === 'FULL_FLUSH_BLIND'
      || device.type === 'BRAND_BLIND') {
      homebridgeDevice = new HmIPBlind(this, hmIPAccessory.accessory);
    } else if (device.type === 'SHUTTER_CONTACT'
      || device.type === 'SHUTTER_CONTACT_INTERFACE'
      || device.type === 'SHUTTER_CONTACT_INVISIBLE'
      || device.type === 'SHUTTER_CONTACT_MAGNETIC'
      || device.type === 'SHUTTER_CONTACT_OPTICAL_PLUS') {
      homebridgeDevice = new HmIPContactSensor(this, hmIPAccessory.accessory);
    } else if (device.type === 'ROTARY_HANDLE_SENSOR') {
      homebridgeDevice = new HmIPRotaryHandleSensor(this, hmIPAccessory.accessory);
    } else if (device.type === 'SMOKE_DETECTOR') {
      homebridgeDevice = new HmIPSmokeDetector(this, hmIPAccessory.accessory);
    } else if (device.type === 'PUSH_BUTTON'
      || device.type === 'PUSH_BUTTON_6'
      || device.type === 'PUSH_BUTTON_FLAT'
      || device.type === 'BRAND_PUSH_BUTTON') {
      homebridgeDevice = new HmIPButton(this, hmIPAccessory.accessory);
    } else if ( device.type === 'PLUGABLE_SWITCH'
      || device.type === 'FULL_FLUSH_INPUT_SWITCH'
      || device.type === 'BRAND_SWITCH_2'
      || device.type === 'PRINTED_CIRCUIT_BOARD_SWITCH_BATTERY'
      || device.type === 'PRINTED_CIRCUIT_BOARD_SWITCH_2'
      || device.type === 'OPEN_COLLECTOR_8_MODULE'
      || device.type === 'HEATING_SWITCH_2'
      || device.type === 'WIRED_SWITCH_8'
      || device.type === 'WIRED_SWITCH_4'
      || device.type === 'DIN_RAIL_SWITCH_4'
      || device.type === 'SWITCH_POWER_SUPPLY') { 
      homebridgeDevice = new HmIPSwitch(this, hmIPAccessory.accessory);
    } else if ( device.type === 'PLUGABLE_SWITCH_MEASURING'
      || device.type === 'BRAND_SWITCH_MEASURING'
      || device.type === 'FULL_FLUSH_SWITCH_MEASURING') {
      homebridgeDevice = new HmIPSwitchMeasuring(this, hmIPAccessory.accessory);
    } else if (device.type === 'TORMATIC_MODULE'
      || device.type === 'HOERMANN_DRIVES_MODULE') {
      homebridgeDevice = new HmIPGarageDoor(this, hmIPAccessory.accessory);
    } else if (device.type === 'WALL_MOUNTED_GARAGE_DOOR_CONTROLLER') {
      homebridgeDevice = new HmIPGarageDoorController(this, hmIPAccessory.accessory);
    } else if (device.type === 'WATER_SENSOR') {
      homebridgeDevice = new HmIPWaterSensor(this, hmIPAccessory.accessory);
    } else if (device.type === 'LIGHT_SENSOR') {
      homebridgeDevice = new HmIPLightSensor(this, hmIPAccessory.accessory);
    } else if (device.type === 'MOTION_DETECTOR_INDOOR'
      || device.type === 'MOTION_DETECTOR_OUTDOOR'
      || device.type === 'MOTION_DETECTOR_PUSH_BUTTON') {
      homebridgeDevice = new HmIPMotionDetector(this, hmIPAccessory.accessory);
    } else if (device.type === 'PRESENCE_DETECTOR_INDOOR') {
      homebridgeDevice = new HmIPPresenceDetector(this, hmIPAccessory.accessory);
    } else if (device.type === 'BRAND_DIMMER'
      || device.type === 'FULL_FLUSH_DIMMER'
      || device.type === 'PLUGGABLE_DIMMER'
      || device.type === 'WIRED_DIMMER_3') { // Only first channel
      homebridgeDevice = new HmIPDimmer(this, hmIPAccessory.accessory);
    } else if (device.type === 'DIN_RAIL_DIMMER_3'
      || device.type === 'RGBW_DIMMER') { // all channels
      homebridgeDevice = new HmIPDimmerMultiChannel(this, hmIPAccessory.accessory);  
    } else if (device.type === 'DOOR_LOCK_DRIVE') {
      homebridgeDevice = new HmIPDoorLockDrive(this, hmIPAccessory.accessory);
    } else if (device.type === 'DOOR_LOCK_SENSOR') {
      homebridgeDevice = new HmIPDoorLockSensor(this, hmIPAccessory.accessory);
    } else if (device.type === 'BRAND_SWITCH_NOTIFICATION_LIGHT') {
      homebridgeDevice = new HmIPSwitchNotificationLight(this, hmIPAccessory.accessory);
    } else if (device.type === 'WEATHER_SENSOR') {
      homebridgeDevice = new HmIPWeatherSensor(this, hmIPAccessory.accessory);
    } else if (device.type === 'WEATHER_SENSOR_PLUS') {
      homebridgeDevice = new HmIPWeatherSensorPlus(this, hmIPAccessory.accessory);
    } else if (device.type === 'WEATHER_SENSOR_PRO') {
      homebridgeDevice = new HmIPWeatherSensorPro(this, hmIPAccessory.accessory);
    } else {
      if (device.type !== 'HOME_CONTROL_ACCESS_POINT' &&
          device.type !== 'EXTERNAL') {
        this.log.warn(`Device not implemented: ${device.modelType} - ${device.label} via type ${device.type}`);
      }
      return;
    }

    if (!homebridgeDevice.hidden) {
      this.deviceMap.set(id, homebridgeDevice);
      hmIPAccessory.register();
    }
  }

  private createAccessory(uuid: string, displayName: string, deviceContext: IdentifiableDevice): HmIPAccessory {
    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.getAccessory(uuid);
    let isFromCache = true;
    if (!existingAccessory) {
      this.log.debug('Could not find existing accessory in pool: '
        + this.accessories.map(val => val.displayName + '/' + val.context).join(', '));
      isFromCache = false;
    } else {
      this.log.debug('Accessory already exists: ' + uuid + ', ' + displayName + ', deviceContext: ' + JSON.stringify(deviceContext));
    }
    const accessory = existingAccessory ? existingAccessory : new this.api.platformAccessory(displayName, uuid);
    accessory.context.device = deviceContext;
    // this.log.info('Checking: ' + JSON.stringify(this.config['devices']) + ' for ID ' + deviceContext.id)
    accessory.context.config = this.config['devices']?.[deviceContext.id];
    return new HmIPAccessory(this.api, this.log, accessory, isFromCache);
  }

  private getAccessory(uuid: string): PlatformAccessory | undefined {
    return this.accessories.find(accessoryFound => accessoryFound.UUID === uuid);
  }

  private createSecuritySystem(home: HmIPHome): HmIPSecuritySystem {
    const id = home.id + '_security';
    const uuid = this.api.hap.uuid.generate(id);
    const hmIPAccessory = this.createAccessory(uuid, 'Home Security System', home);
    const securitySystem = new HmIPSecuritySystem(this, hmIPAccessory.accessory);

    if (!securitySystem.hidden) {
      this.deviceMap.set(id, securitySystem);
      hmIPAccessory.register();
    }

    return securitySystem;
  }
}
