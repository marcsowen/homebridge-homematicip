import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface LightSensorChannel {
    functionalChannelType: string;
    averageIllumination: number;
    currentIllumination: number;
    highestIllumination: number;
    lowestIllumination: number;
}

/**
 * HomematicIP light sensor
 *
 * HmIP-SLO (Light Sensor outdoor)
 */
export class HmIPLightSensor extends HmIPGenericDevice implements Updateable {
    private service: Service;

    private averageIllumination: number = 0;

    constructor(
        platform: HmIPPlatform,
        accessory: PlatformAccessory,
    ) {
        super(platform, accessory);

        this.platform.log.debug('Created light sensor %s', accessory.context.device.label);
        this.service = this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

        this.updateDevice(accessory.context.device, platform.groups);

        this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
            .on('get', this.handleCurrentAmbientLightLevelGet.bind(this));
    }

    handleCurrentAmbientLightLevelGet(callback: CharacteristicGetCallback) {
        callback(null, this.averageIllumination);
    }

    public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
        super.updateDevice(hmIPDevice, groups);
        for (const id in hmIPDevice.functionalChannels) {
            const channel = hmIPDevice.functionalChannels[id];
            if (channel.functionalChannelType === 'LIGHT_SENSOR_CHANNEL') {
                const lightSensorChannel = <LightSensorChannel>channel;
                this.platform.log.debug('Light sensor update: %s', JSON.stringify(channel));

                if (lightSensorChannel.averageIllumination !== null && lightSensorChannel.averageIllumination !== this.averageIllumination) {
                    this.averageIllumination = lightSensorChannel.averageIllumination;
                    this.platform.log.info('Average light level of %s changed to %s lx', this.accessory.displayName, this.averageIllumination);
                    this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.averageIllumination);
                }
            }
        }
    }
}
