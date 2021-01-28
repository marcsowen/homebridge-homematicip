import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface WaterSensorChannel {
    functionalChannelType: string;
    moistureDetected: boolean;
    waterlevelDetected: boolean;
}

/**
 * HomematicIP water sensor
 *
 * HmIP-SWD
 */
export class HmIPWaterSensor extends HmIPGenericDevice implements Updateable {
    private moistureService: Service;
    private waterLevelService: Service;

    private moistureDetected: boolean = false;
    private waterlevelDetected: boolean = false;

    constructor(
        platform: HmIPPlatform,
        home: HmIPHome,
        accessory: PlatformAccessory,
    ) {
        super(platform, home, accessory);

        this.platform.log.debug(`Created water sensor ${accessory.context.device.label}`);
        this.moistureService = this.accessory.getService(this.platform.Service.LeakSensor) || this.accessory.addService(this.platform.Service.LeakSensor);
        this.moistureService.setCharacteristic(this.platform.Characteristic.Name, "Moisture");

        this.moistureService.getCharacteristic(this.platform.Characteristic.LeakDetected)
            .on('get', this.handleMoistureDetectedGet.bind(this));

        this.waterLevelService = this.accessory.getService(this.platform.Service.LeakSensor) || this.accessory.addService(this.platform.Service.LeakSensor);
        this.waterLevelService.setCharacteristic(this.platform.Characteristic.Name, "Water level");

        this.waterLevelService.getCharacteristic(this.platform.Characteristic.LeakDetected)
            .on('get', this.handleWaterLevelDetectedGet.bind(this));

        this.updateDevice(home, accessory.context.device, platform.groups);
    }

    handleMoistureDetectedGet(callback: CharacteristicGetCallback) {
        callback(null, this.moistureDetected
            ? this.platform.Characteristic.LeakDetected.LEAK_DETECTED
            : this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
    }

    handleWaterLevelDetectedGet(callback: CharacteristicGetCallback) {
        callback(null, this.waterlevelDetected
            ? this.platform.Characteristic.LeakDetected.LEAK_DETECTED
            : this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
    }

    public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
        super.updateDevice(hmIPHome, hmIPDevice, groups);
        this.home = hmIPHome;
        for (const id in hmIPDevice.functionalChannels) {
            const channel = hmIPDevice.functionalChannels[id];
            if (channel.functionalChannelType === 'WATER_SENSOR_CHANNEL') {
                const waterSensorChannel = <WaterSensorChannel>channel;
                this.platform.log.debug(`Water sensor update: ${JSON.stringify(channel)}`);

                if (waterSensorChannel.moistureDetected !== null && waterSensorChannel.moistureDetected !== this.moistureDetected) {
                    this.moistureDetected = waterSensorChannel.moistureDetected;
                    this.platform.log.info("Water sensor moisture detection of %s changed to %s", this.accessory.displayName, this.moistureDetected);
                    this.moistureService.updateCharacteristic(this.platform.Characteristic.LeakDetected,
                    this.moistureDetected
                        ? this.platform.Characteristic.LeakDetected.LEAK_DETECTED
                        : this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
                }

                if (waterSensorChannel.waterlevelDetected !== null && waterSensorChannel.waterlevelDetected !== this.waterlevelDetected) {
                    this.waterlevelDetected = waterSensorChannel.waterlevelDetected;
                    this.platform.log.info("Water sensor water level detection of %s changed to %s", this.accessory.displayName, this.waterlevelDetected);
                    this.waterLevelService.updateCharacteristic(this.platform.Characteristic.LeakDetected,
                        this.waterlevelDetected
                            ? this.platform.Characteristic.LeakDetected.LEAK_DETECTED
                            : this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
                }

            }
        }
    }
}
