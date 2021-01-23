import {API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service} from 'homebridge';
import {HmIPConnector} from './HmIPConnector';
import {PLATFORM_NAME, PLUGIN_NAME, PLUGIN_VERSION} from './settings';
import {HmIPDevice, HmIPGroup, HmIPHome, HmIPState, HmIPStateChange, Updateable} from './HmIPState';
import {HmIPShutter} from './devices/HmIPShutter';
import {HmIPWallMountedThermostat} from './devices/HmIPWallMountedThermostat';
import {HmIPHomeControlAccessPoint} from './devices/HmIPHomeControlAccessPoint';
import {HmIPContactSensor} from './devices/HmIPContactSensor';
import {HmIPGenericDevice} from './devices/HmIPGenericDevice';
import {HmIPAccessory} from './HmIPAccessory';
import {HmIPHeatingThermostat} from './devices/HmIPHeatingThermostat';
import * as os from 'os';
import {HmIPPushButton} from './devices/HmIPPushButton';
import {HmIPSmokeDetector} from './devices/HmIPSmokeDetector';
import {HmIPSwitch} from './devices/HmIPSwitch';

/**
 * HomematicIP platform
 */
export class HmIPPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly connector: HmIPConnector;
  public groups!: { [key: string]: HmIPGroup };
  private home!: HmIPHome;
  private deviceMap = new Map();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.info('%s v%s', PLUGIN_NAME, PLUGIN_VERSION);

    this.connector = new HmIPConnector(
      log,
      config['access_point'],
      config['auth_token'],
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
    this.log.info('SUCCESS! Your auth_token is: ' + authTokenResponse.authToken + ' (Access Point ID: ' + accessPointId
      + ', Client ID: ' + confirmResponse.clientId + '). Update \'auth_token\' in config and restart.');
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

    const hmIPState = <HmIPState>await this.connector.apiCall('home/getCurrentState', this.connector.clientCharacteristics);
    if (!hmIPState || !hmIPState.devices) {
      this.log.info(`HomematicIP response is incomplete or could not be parsed: ${hmIPState}`);
      return;
    }

    this.groups = hmIPState.groups;
    // this.setHome(hmIPState.home);

    // loop over the discovered devices and register each one if it has not already been registered
    for (const id in hmIPState.devices) {
      const device = hmIPState.devices[id];
      this.updateAccessory(id, this.home, device);
    }

    // Start websocket immediately and register handlers
    await this.connector.connectWs(data => {
      const stateChange = <HmIPStateChange>JSON.parse(data.toString());
      for (const id in stateChange.events) {
        const event = stateChange.events[id];
        switch (event.pushEventType) {
          case 'GROUP_CHANGED':
          case 'GROUP_ADDED':
            if (event.group) {
              this.log.debug(`${event.pushEventType}: ${event.group.id}`);
              hmIPState.groups[event.group.id] = event.group;
              this.groups[event.group.id] = event.group;
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
                (<Updateable>this.deviceMap.get(event.device.id)).updateDevice(this.home, event.device, this.groups);
              } else {
                this.log.debug('Device add/change event from unregistered device: ' + event.device.id);
              }
            }
            break;
          case 'HOME_CHANGED':
            if (event.home) {
              this.log.debug(`${event.pushEventType}: ${event.home.id} ${JSON.stringify(event.home)}`);
              // this.setHome(event.home);
              this.deviceMap.forEach(device => {
                device.home = event.home;
                device.updateDevice(device, this.groups);
              });
            }
            break;
          default:
            this.log.debug(`Unhandled event type: ${event.pushEventType} group=${event.group} device=${event.device}`);
        }
      }
    });
  }

  /*
  private setHome(home: HmIPHome) {
    home.oem = 'eQ-3';
    home.modelType = 'HmIPHome';
    home.firmwareVersion = home.currentAPVersion;
    this.updateHomeAccessories(home);
  }
   */

  private updateAccessory(id: string, home: HmIPHome, device: HmIPDevice) {
    const uuid = this.api.hap.uuid.generate(id);
    const hmIPAccessory = this.createAccessory(uuid, device.label, device);
    let homebridgeDevice: HmIPGenericDevice | null = null;
    if (device.type === 'WALL_MOUNTED_THERMOSTAT_PRO') {
      homebridgeDevice = new HmIPWallMountedThermostat(this, home, hmIPAccessory.accessory);
    } else if (device.type === 'HEATING_THERMOSTAT') {
      homebridgeDevice = new HmIPHeatingThermostat(this, home, hmIPAccessory.accessory);
    } else if (device.type === 'FULL_FLUSH_SHUTTER'
        || device.type === 'BRAND_SHUTTER') {
      homebridgeDevice = new HmIPShutter(this, home, hmIPAccessory.accessory);
    } else if (device.type === 'SHUTTER_CONTACT'
        || device.type === 'SHUTTER_CONTACT_INTERFACE'
        || device.type === 'SHUTTER_CONTACT_INVISIBLE'
        || device.type === 'SHUTTER_CONTACT_MAGNETIC'
        || device.type === 'SHUTTER_CONTACT_OPTICAL_PLUS'
        || device.type === 'ROTARY_HANDLE_CHANNEL') {
      homebridgeDevice = new HmIPContactSensor(this, home, hmIPAccessory.accessory);
    } else if (device.type === 'PUSH_BUTTON'
        || device.type === 'BRAND_PUSH_BUTTON'
        || device.type === 'PUSH_BUTTON_6'
        || device.type === 'REMOTE_CONTROL_8'
        || device.type === 'REMOTE_CONTROL_8_MODULE'
        || device.type === 'KEY_REMOTE_CONTROL_4'
        || device.type === 'KEY_REMOTE_CONTROL_4') {
      homebridgeDevice = new HmIPPushButton(this, home, hmIPAccessory.accessory);
    } else if (device.type === 'SMOKE_DETECTOR') {
      homebridgeDevice = new HmIPSmokeDetector(this, home, hmIPAccessory.accessory);
    } else if ( device.type === 'PLUGABLE_SWITCH'
        || device.type === 'PRINTED_CIRCUIT_BOARD_SWITCH_BATTERY'
        || device.type === 'PRINTED_CIRCUIT_BOARD_SWITCH_2' // Only first channel
        || device.type === 'OPEN_COLLECTOR_8_MODULE' // Only first channel
        || device.type === 'HEATING_SWITCH_2' // Only first channel
        || device.type === 'WIRED_SWITCH_8' // Only first channel
        || device.type === 'DIN_RAIL_SWITCH_4' // Only first channel
        || device.type === 'PLUGABLE_SWITCH_MEASURING'
        || device.type === 'BRAND_SWITCH_MEASURING'
        || device.type === 'FULL_FLUSH_SWITCH_MEASURING'
    ) {
      homebridgeDevice = new HmIPSwitch(this, home, hmIPAccessory.accessory);
    } else if (device.type === 'HOME_CONTROL_ACCESS_POINT') {
      homebridgeDevice = new HmIPHomeControlAccessPoint(this, home, hmIPAccessory.accessory);
    } else {
      this.log.warn(`Device not implemented: ${device.modelType} - ${device.label} via type ${device.type}`);
      return;
    }
    this.deviceMap.set(id, homebridgeDevice);
    hmIPAccessory.register();
  }

  /*
  private updateHomeAccessories(home: HmIPHome) {
    this.updateHomeWeatherAccessory(home);
  }

  private updateHomeWeatherAccessory(homeOriginal: HmIPHome) {
    const home = Object.assign({}, homeOriginal);
    home.id = home.id + '__weather';
    const uuid = this.api.hap.uuid.generate(home.id);
    const hmIPAccessory = this.createAccessory(uuid, 'HmIPWeather', home);
    const homeBridgeDevice = new HmIPWeatherDevice(this, home, hmIPAccessory.accessory);
    this.deviceMap.set(home.id, homeBridgeDevice);
    hmIPAccessory.register();
  }
   */

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

}
