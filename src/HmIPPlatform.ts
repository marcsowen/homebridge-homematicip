import {API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service} from 'homebridge';
import {HmIPConnector} from './HmIPConnector';
import {PLATFORM_NAME, PLUGIN_NAME, PLUGIN_VERSION} from './settings';
import {HmIPDevice, HmIPGroup, HmIPHome, HmIPState, HmIPStateChange, Updateable} from './HmIPState';
import {HmIPShutter} from './devices/HmIPShutter';
import {HmIPHeatingThermostat} from './devices/HmIPHeatingThermostat';
import {HmIPContactSensor} from './devices/HmIPContactSensor';
import {HmIPGenericDevice} from './devices/HmIPGenericDevice';
import {HmIPAccessory} from './HmIPAccessory';
import * as os from 'os';
import {HmIPSmokeDetector} from './devices/HmIPSmokeDetector';
import {HmIPSwitch} from './devices/HmIPSwitch';
import {HmIPGarageDoor} from './devices/HmIPGarageDoor';
import {HmIPClimateSensor} from './devices/HmIPClimateSensor';
import {HmIPWaterSensor} from './devices/HmIPWaterSensor';
import {HmIPBlind} from './devices/HmIPBlind';
import {HmIPSwitchMeasuring} from './devices/HmIPSwitchMeasuring';
import {CustomCharacteristic} from './CustomCharacteristic';
import {HmIPLightSensor} from './devices/HmIPLightSensor';
import {HmIPSecuritySystem} from './HmIPSecuritySystem';
import {HmIPRotaryHandleSensor} from './devices/HmIPRotaryHandleSensor';
import {HmIPMotionDetector} from './devices/HmIPMotionDetector';
import {HmIPPresenceDetector} from './devices/HmIPPresenceDetector';
import {HmIPDimmer} from './devices/HmIPDimmer';
import fakegato from 'fakegato-history';
import {HmIPDoorLockDrive} from './devices/HmIPDoorLockDrive';
import {HmIPDoorLockSensor} from './devices/HmIPDoorLockSensor';
import {HmIPSwitchNotificationLight} from './devices/HmIPSwitchNotificationLight';

/**
 * HomematicIP platform
 */
export class HmIPPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly FakeGatoHistoryService = fakegato(this.api);

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
   * It should be used to setup event handlers for characteristics and update respective values.
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
    if (HmIPHeatingThermostat.isThermostat(device.type)) {
      const accessoryConfig = this.config['devices']?.[device.id];
      const asClimateSensor = accessoryConfig?.['asClimateSensor'] === true;
      if (asClimateSensor && !HmIPHeatingThermostat.isHeatingThermostat(device.type)) {
        homebridgeDevice = new HmIPClimateSensor(this, hmIPAccessory.accessory);
      } else {
        homebridgeDevice = new HmIPHeatingThermostat(this, hmIPAccessory.accessory);
      }
    } else if (device.type === 'TEMPERATURE_HUMIDITY_SENSOR_OUTDOOR') {
      homebridgeDevice = new HmIPClimateSensor(this, hmIPAccessory.accessory);
      /*
    } else if (device.type === 'HEATING_THERMOSTAT'
      || device.type === 'HEATING_THERMOSTAT_COMPACT'
      || device.type === 'HEATING_THERMOSTAT_EVO') {
      homebridgeDevice = new HmIPLegacyHeatingThermostat(this, hmIPAccessory.accessory);

       */
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
    } else if (device.type === 'PLUGABLE_SWITCH'
      || device.type === 'PRINTED_CIRCUIT_BOARD_SWITCH_BATTERY'
      || device.type === 'PRINTED_CIRCUIT_BOARD_SWITCH_2' // Only first channel
      || device.type === 'OPEN_COLLECTOR_8_MODULE' // Only first channel
      || device.type === 'HEATING_SWITCH_2' // Only first channel
      || device.type === 'WIRED_SWITCH_8' // Only first channel
      || device.type === 'DIN_RAIL_SWITCH_4') { // Only first channel
      homebridgeDevice = new HmIPSwitch(this, hmIPAccessory.accessory);
    } else if (device.type === 'PLUGABLE_SWITCH_MEASURING'
      || device.type === 'BRAND_SWITCH_MEASURING'
      || device.type === 'FULL_FLUSH_SWITCH_MEASURING') {
      homebridgeDevice = new HmIPSwitchMeasuring(this, hmIPAccessory.accessory);
    } else if (device.type === 'TORMATIC_MODULE'
      || device.type === 'HOERMANN_DRIVES_MODULE') {
      homebridgeDevice = new HmIPGarageDoor(this, hmIPAccessory.accessory);
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
    } else if (device.type === 'DOOR_LOCK_DRIVE') {
      homebridgeDevice = new HmIPDoorLockDrive(this, hmIPAccessory.accessory);
    } else if (device.type === 'DOOR_LOCK_SENSOR') {
      homebridgeDevice = new HmIPDoorLockSensor(this, hmIPAccessory.accessory);
    } else if (device.type === 'BRAND_SWITCH_NOTIFICATION_LIGHT') {
      homebridgeDevice = new HmIPSwitchNotificationLight(this, hmIPAccessory.accessory);
    } else {
      this.log.warn(`Device not implemented: ${device.modelType} - ${device.label} via type ${device.type}`);
      return;
    }

    if (!homebridgeDevice.hidden) {
      this.deviceMap.set(id, homebridgeDevice);
      hmIPAccessory.register();
    }
  }

  private createAccessory(uuid: string, displayName: string, deviceContext: unknown): HmIPAccessory {
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
