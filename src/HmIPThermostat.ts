import {
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    PlatformAccessory,
    Service
} from 'homebridge';

import {HmIPPlatform} from './HmIPPlatform';
import {HmIPDevice, HmIPGroup} from "./HmIPState";

interface WallMountedThermostatProChannel {
    functionalChannelType: string;
    actualTemperature: number;
    setPointTemperature: number;
    humidity: number;
    groups: string[];
}

export interface Updateable {
    updateDevice(device: HmIPDevice, groups: { [key: string]: HmIPGroup }): void;
}

/**
 * HomematicIP Thermostat
 */
export class HmIPThermostat implements Updateable {
    private service: Service;

    private actualTemperature: number = 0;
    private setPointTemperature: number = 0;
    private humidity: number = 0;
    private heatingGroupId: string = "";

    constructor(
        private readonly platform: HmIPPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.oem)
            .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.modelType)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion);

        this.service = this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

        this.updateDevice(accessory.context.device, platform.groups);

        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
            .on('get', this.handleCurrentHeatingCoolingStateGet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
            .on('get', this.handleTargetHeatingCoolingStateGet.bind(this))
            .on('set', this.handleTargetHeatingCoolingStateSet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .on('get', this.handleCurrentTemperatureGet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
            .on('get', this.handleTargetTemperatureGet.bind(this))
            .on('set', this.handleTargetTemperatureSet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
            .on('get', this.handleTemperatureDisplayUnitsGet.bind(this))
            .on('set', this.handleTemperatureDisplayUnitsSet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
            .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
    }

    handleCurrentHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug(`Getting current heating/cooling state for ${this.accessory.displayName}.`);
        callback(null, this.platform.Characteristic.CurrentHeatingCoolingState.HEAT);
    }

    handleTargetHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug(`Getting target heating/cooling state for ${this.accessory.displayName}.`);
        callback(null, this.platform.Characteristic.CurrentHeatingCoolingState.HEAT);
    }

    handleTargetHeatingCoolingStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.platform.log.debug(`Setting target heating/cooling state for ${this.accessory.displayName} to ${value}.`);
        callback(null);
    }

    handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug(`Getting current temperature for ${this.accessory.displayName}.`);
        callback(null, this.actualTemperature);
    }

    handleTargetTemperatureGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug(`Getting target temperature for ${this.accessory.displayName}.`);
        callback(null, this.setPointTemperature);
    }

    async handleTargetTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.platform.log.debug(`Setting target temperature for ${this.accessory.displayName} to ${value}.`);
        const body = {
            groupId: this.heatingGroupId,
            setPointTemperature: value
        }
        await this.platform.connector.apiCall("group/heating/setSetPointTemperature", body)
        callback(null);
    }

    handleTemperatureDisplayUnitsGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug('Getting temperature display units.');
        callback(null, this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
    }

    handleTemperatureDisplayUnitsSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.platform.log.debug(`Setting temperature display units for ${this.accessory.displayName} to ${value}.`);
        callback(null);
    }

    handleCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug(`Getting current relative humidity for ${this.accessory.displayName}.`);
        callback(null, this.humidity);
    }

    public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
        this.platform.log.debug('Updating thermostat:', this.accessory.displayName)
        for (const id in hmIPDevice.functionalChannels) {
            const channel = hmIPDevice.functionalChannels[id];
            if (channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL') {
                const wthChannel = <WallMountedThermostatProChannel> channel;

                if (wthChannel.setPointTemperature != this.setPointTemperature) {
                    this.platform.log.info(" - Target temperature changed:", wthChannel.setPointTemperature);
                    this.setPointTemperature = wthChannel.setPointTemperature;
                    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.setPointTemperature);
                }

                if (wthChannel.actualTemperature != this.actualTemperature) {
                    this.platform.log.info(" - Current temperature changed:", wthChannel.actualTemperature);
                    this.actualTemperature = wthChannel.actualTemperature;
                    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.actualTemperature);
                }

                if (wthChannel.humidity != this.humidity) {
                    this.platform.log.info(" - Current relative humidity changed:", wthChannel.humidity);
                    this.humidity = wthChannel.humidity;
                    this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
                }

                for (const groupId of wthChannel.groups) {
                    if (groups[groupId].type == "HEATING") {
                        this.platform.log.debug(" - Setting heating group id to:", groupId);
                        this.heatingGroupId = groupId;
                    }
                }
            }
        }
    }
}