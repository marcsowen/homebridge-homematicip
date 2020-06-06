import {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service
} from 'homebridge';
import {HmIPConnector} from "./HmIPConnector";
import {HmIPThermostat} from "./HmIPThermostat";
import {PLATFORM_NAME, PLUGIN_NAME} from "./settings";
import {HmIPDeviceChangeEvent, HmIPGroup, HmIPState, HmIPStateChange, Updateable} from "./HmIPState";
import {HmIPShutter} from "./HmIPShutter";

/**
 * HomematicIP platform
 */
export class HmIPPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];

    public readonly connector: HmIPConnector;
    public groups!: { [key: string]: HmIPGroup }
    private deviceMap = new Map();

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.connector = new HmIPConnector(
            log,
            config["access_point"],
            config["auth_token"]
        );

        this.log.debug('Finished initializing platform:', this.config.name);
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            this.discoverDevices();
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    async discoverDevices() {
        await this.connector.init();
        const hmIPState = <HmIPState> await this.connector.apiCall("home/getCurrentState");
        this.groups = hmIPState.groups;

        // loop over the discovered devices and register each one if it has not already been registered
        for (const id in hmIPState.devices) {
            const device = hmIPState.devices[id];
            const uuid = this.api.hap.uuid.generate(id);

            // see if an accessory with the same uuid has already been registered and restored from
            // the cached devices we stored in the `configureAccessory` method above
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

            if (existingAccessory) {
                this.log.info('Restoring existing HmIP device from cache:', existingAccessory.displayName);

                existingAccessory.context.device = device;
                this.api.updatePlatformAccessories([existingAccessory]);

                if (device.type === 'WALL_MOUNTED_THERMOSTAT_PRO') {
                    this.deviceMap.set(id, new HmIPThermostat(this, existingAccessory));
                } else if (device.type === 'FULL_FLUSH_SHUTTER') {
                    this.deviceMap.set(id, new HmIPShutter(this, existingAccessory));
                }
            } else {
                if (device.type === 'WALL_MOUNTED_THERMOSTAT_PRO') {
                    this.log.info(`Adding new HmIP thermostat: ${device.modelType} - ${device.label}`);
                    const accessory = new this.api.platformAccessory(device.label, uuid);
                    accessory.context.device = device;
                    this.deviceMap.set(id, new HmIPThermostat(this, accessory));
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                } else if (device.type === 'FULL_FLUSH_SHUTTER') {
                    this.log.info(`Adding new HmIP shutter: ${device.modelType} - ${device.label}`);
                    const accessory = new this.api.platformAccessory(device.label, uuid);
                    accessory.context.device = device;
                    this.deviceMap.set(id, new HmIPShutter(this, accessory));
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                }
            }
        }

        await this.connector.connectWs( data => {
            const stateChange = <HmIPStateChange> JSON.parse(data.toString());

            for (const stateChangeEventId in stateChange.events) {
                const stateChangeEvent = stateChange.events[stateChangeEventId];

                if (stateChangeEvent.pushEventType === 'DEVICE_CHANGED') {
                    const deviceChangeEvent = <HmIPDeviceChangeEvent> stateChangeEvent;
                    this.log.debug(`Device changed: ${deviceChangeEvent.device.modelType} - ${deviceChangeEvent.device.label}`);

                    if (this.deviceMap.has(deviceChangeEvent.device.id)) {
                        (<Updateable> this.deviceMap.get(deviceChangeEvent.device.id))
                            .updateDevice(deviceChangeEvent.device, this.groups);
                    }
                }
            }
        });
    }
}