import * as os from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';
import fakegato from 'fakegato-history';
import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  Service,
} from 'homebridge';
import {
  HmIPClient,
  type HmIPDevice,
  type HmIPGroup,
  type HmIPHome,
  type IdentifiableDevice,
} from 'homematicip-cloud-client-ts';
import {CustomCharacteristic} from './CustomCharacteristic.js';
import {HmIPAccessoryRepository} from './HmIPAccessoryRepository.js';
import type {HmIPPlatformConfig} from './HmIPConfig.js';
import {
  getHmIPDeviceKind,
  HmIPDeviceFactory,
  isHmIPControllerDevice,
  isHmIPExternalDevice,
} from './HmIPDeviceFactory.js';
import {HmIPEventRouter} from './HmIPEventRouter.js';
import {HmIPSecuritySystem} from './HmIPSecuritySystem.js';
import {type HmIPDeviceAdapter, type HmIPPlatformAccessory, isHmIPAccessoryContext} from './HmIPTypes.js';
import {PLATFORM_NAME, PLUGIN_NAME, PLUGIN_VERSION} from './settings.js';

type PlatformLifecycleState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';
const PAIRING_TIMEOUT_MILLIS = 5 * 60 * 1000;
const HCU_PAIRING_PREPARATION_MILLIS = 10 * 1000;

/**
 * HomematicIP platform
 */
export class HmIPPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly FakeGatoHistoryService: typeof fakegato;

  public readonly connector: HmIPClient;
  public groups: Record<string, HmIPGroup> = {};
  private readonly accessoryRepository: HmIPAccessoryRepository;
  private readonly deviceMap = new Map<string, HmIPDeviceAdapter>();
  private readonly deviceFactory: HmIPDeviceFactory;
  private readonly shutdownController = new AbortController();
  private lifecycleState: PlatformLifecycleState = 'idle';
  public customCharacteristic: CustomCharacteristic;

  public securitySystem: HmIPSecuritySystem | undefined;

  constructor(
    public readonly log: Logger,
    public readonly config: HmIPPlatformConfig,
    public readonly api: API,
  ) {
    this.log.info('%s v%s', PLUGIN_NAME, PLUGIN_VERSION);

    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.FakeGatoHistoryService = fakegato(this.api);
    this.customCharacteristic = new CustomCharacteristic(api);
    this.accessoryRepository = new HmIPAccessoryRepository(api, log, config.devices);
    this.deviceFactory = new HmIPDeviceFactory(this);

    this.connector = new HmIPClient(log, {
      accessPoint: config.access_point,
      applicationIdentifier: PLUGIN_NAME,
      applicationVersion: PLUGIN_VERSION,
      deviceName: PLUGIN_NAME,
      ...(config.auth_token === undefined ? {} : {authToken: config.auth_token}),
      ...(config.pin === undefined ? {} : {pin: config.pin}),
    });
    this.log.debug('Finished initializing platform:', this.config.name);
    this.api.on('didFinishLaunching', () => {
      void this.start();
    });
    this.api.on('shutdown', () => {
      this.stop();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    if (!isHmIPAccessoryContext(accessory.context)) {
      this.log.warn('Removing cached accessory %s because its context is invalid.', accessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      return;
    }
    if (this.accessoryRepository.restore(accessory as HmIPPlatformAccessory<IdentifiableDevice>)) {
      this.log.info('Loading accessory from cache:', accessory.displayName);
    }
  }

  private async start(): Promise<void> {
    if (this.lifecycleState !== 'idle') {
      this.log.debug('Ignoring platform start while lifecycle state is %s.', this.lifecycleState);
      return;
    }
    this.lifecycleState = 'starting';
    this.log.debug('Starting Homematic IP platform.');

    if (!this.connector.isReadyForUse() && !this.connector.isReadyForPairing()) {
      this.log.error('Please configure \'access_point\' in \'config.json\' (sticker on the back) and make ' +
        'sure the Homematic IP controller is online.');
      this.lifecycleState = 'stopped';
      return;
    }

    try {
      const started = this.connector.isReadyForUse()
        ? await this.discoverDevices()
        : await this.startPairing(this.config.access_point);
      if (this.lifecycleState === 'starting') {
        this.lifecycleState = started ? 'running' : 'idle';
      }
    } catch (error) {
      if (!this.shutdownController.signal.aborted) {
        this.log.error('Platform startup failed: %s', error instanceof Error ? error.message : String(error));
      }
      if (this.lifecycleState === 'starting') {
        this.lifecycleState = 'idle';
      }
    }
  }

  private async startPairing(accessPointId: string): Promise<boolean> {
    const shutdownSignal = this.shutdownController.signal;
    if (!(await this.connector.init(shutdownSignal)).valueOf()) {
      return false;
    }
    const signal = AbortSignal.any([shutdownSignal, AbortSignal.timeout(PAIRING_TIMEOUT_MILLIS)]);
    try {
      return await this.completePairing(accessPointId, signal);
    } catch (error) {
      if (signal.aborted && !shutdownSignal.aborted) {
        this.log.error('Pairing timed out after %d minutes.', PAIRING_TIMEOUT_MILLIS / 60000);
        return false;
      }
      throw error;
    }
  }

  private async completePairing(accessPointId: string, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted();
    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}_${os.hostname()}`);
    this.log.info(
      'If pairing an HmIP-HCU1, press the button on top now. Registration starts in %d seconds.',
      HCU_PAIRING_PREPARATION_MILLIS / 1000,
    );
    await sleep(HCU_PAIRING_PREPARATION_MILLIS, undefined, {signal});
    const connectionStarted = await this.connector.authConnectionRequest(uuid, signal);
    signal.throwIfAborted();
    if (!connectionStarted) {
      this.log.error(
        'Cannot start auth request for access_point=%s. For an HmIP-HCU1, press its top button before retrying.',
        accessPointId,
      );
      return false;
    }
    while (true) {
      this.log.info('Press the blue link button of the HmIP-HAP now; HmIP-HCU1 users can wait for registration.');
      await sleep(5000, undefined, {signal});
      const acknowledgement = await this.connector.authRequestAcknowledged(uuid, signal);
      if (acknowledgement.status === 'acknowledged') {
        break;
      }
      if (acknowledgement.status === 'failed') {
        signal.throwIfAborted();
        this.log.error(
          'Cannot check pairing acknowledgement for access_point=%s: %s (%s)',
          accessPointId,
          acknowledgement.error.message,
          acknowledgement.error.kind,
        );
        return false;
      }
    }
    signal.throwIfAborted();

    const authTokenResponse = await this.connector.authRequestToken(uuid, signal);
    signal.throwIfAborted();
    if (authTokenResponse === false || !authTokenResponse.authToken) {
      this.log.error(`Cannot request auth token for access_point=${accessPointId}`);
      return false;
    }

    const confirmResponse = await this.connector.authConfirmToken(uuid, authTokenResponse.authToken, signal);
    signal.throwIfAborted();
    if (confirmResponse === false || !confirmResponse.clientId) {
      this.log.error(`Cannot confirm auth token for access_point=${accessPointId}`);
      return false;
    }

    this.log.info('Pairing succeeded for access point %s (client ID: %s).', accessPointId, confirmResponse.clientId);
    this.log.info('Add this auth_token to config.json and restart Homebridge: %s', authTokenResponse.authToken);
    this.log.info('Remove pin from config.json after pairing unless it is still needed.');
    return true;
  }

  /**
   * Register discovered Homematic IP accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  private async discoverDevices(): Promise<boolean> {
    const signal = this.shutdownController.signal;
    if (!(await this.connector.init(signal)).valueOf()) {
      return false;
    }
    signal.throwIfAborted();

    const stateResponse = await this.connector.getCurrentState(signal);
    signal.throwIfAborted();
    if (stateResponse === false) {
      return false;
    }
    const hmIPState = stateResponse;

    this.groups = hmIPState.groups;
    // this.setHome(hmIPState.home);

    const activeAccessoryUuids = new Set<string>();

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of Object.values(hmIPState.devices)) {
      const uuid = this.updateAccessory(device);
      if (uuid) {
        activeAccessoryUuids.add(uuid);
      }
    }

    const securitySystemUuid = this.updateSecuritySystem(hmIPState.home);
    if (securitySystemUuid) {
      activeAccessoryUuids.add(securitySystemUuid);
    }
    this.accessoryRepository.reconcile(activeAccessoryUuids);

    const eventRouter = new HmIPEventRouter(this.log, hmIPState, this.deviceMap, {
      addDevice: device => this.updateAccessory(device),
      removeDevice: (deviceId, adapter) => this.removeAccessory(deviceId, adapter),
      updateHome: home => this.securitySystem?.updateHome(home),
      updateSecurityGroups: groups => this.securitySystem?.updateGroups(groups),
    });

    // Start websocket immediately and register handlers
    this.connector.connect(stateChange => eventRouter.handle(stateChange));
    return true;
  }

  private updateAccessory(device: HmIPDevice): string | undefined {
    if (this.shutdownController.signal.aborted) {
      return undefined;
    }

    if (isHmIPExternalDevice(device)) {
      const existingDevice = this.deviceMap.get(device.id);
      if (existingDevice) {
        this.removeAccessory(device.id, existingDevice);
      }
      return undefined;
    }

    const existingDevice = this.deviceMap.get(device.id);
    if (existingDevice) {
      existingDevice.updateDevice(device, this.groups);
      return existingDevice.accessory.UUID;
    }

    const uuid = this.api.hap.uuid.generate(device.id);
    if (getHmIPDeviceKind(device) === undefined) {
      this.accessoryRepository.remove(uuid);
      if (!isHmIPControllerDevice(device)) {
        this.log.warn(`Device not implemented: ${device.modelType} - ${device.label} via type ${device.type}`);
      }
      return undefined;
    }

    const hmIPAccessory = this.accessoryRepository.acquire(uuid, device.label, device);
    const homebridgeDevice = this.deviceFactory.create(device, hmIPAccessory.accessory);
    if (!homebridgeDevice) {
      this.accessoryRepository.remove(uuid);
      if (!isHmIPControllerDevice(device)) {
        this.log.warn(`Device not implemented: ${device.modelType} - ${device.label} via type ${device.type}`);
      }
      return undefined;
    }

    if (!homebridgeDevice.hasFunctionalServices) {
      homebridgeDevice.dispose();
      this.accessoryRepository.remove(uuid);
      return undefined;
    }

    if (homebridgeDevice.hidden) {
      homebridgeDevice.dispose();
      this.accessoryRepository.remove(uuid);
      return undefined;
    }

    this.deviceMap.set(device.id, homebridgeDevice);
    this.accessoryRepository.register(hmIPAccessory);
    return uuid;
  }

  private removeAccessory(deviceId: string, adapter: HmIPDeviceAdapter): void {
    adapter.dispose();
    this.accessoryRepository.remove(adapter.accessory.UUID);
    this.deviceMap.delete(deviceId);
  }

  private stop(): void {
    if (this.lifecycleState === 'stopping' || this.lifecycleState === 'stopped') {
      return;
    }
    this.lifecycleState = 'stopping';
    this.log.debug('Executed shutdown callback');
    this.shutdownController.abort();
    this.connector.shutdown();
    for (const adapter of this.deviceMap.values()) {
      adapter.dispose();
    }
    this.deviceMap.clear();
    this.lifecycleState = 'stopped';
  }

  private updateSecuritySystem(home: HmIPHome): string | undefined {
    const id = `${home.id}_security`;
    const uuid = this.api.hap.uuid.generate(id);
    if (this.securitySystem) {
      this.securitySystem.updateHome(home);
      this.securitySystem.updateGroups(this.groups);
      return this.securitySystem.hidden ? undefined : uuid;
    }

    const hmIPAccessory = this.accessoryRepository.acquire(uuid, 'Home Security System', home);
    const securitySystem = new HmIPSecuritySystem(this, hmIPAccessory.accessory);
    this.securitySystem = securitySystem;

    if (securitySystem.hidden) {
      this.accessoryRepository.remove(uuid);
      return undefined;
    }

    securitySystem.updateGroups(this.groups);
    this.accessoryRepository.register(hmIPAccessory);
    return uuid;
  }
}
