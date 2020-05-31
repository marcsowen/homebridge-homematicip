import {
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    PlatformAccessory,
    Service
} from 'homebridge';

import {HmIPPlatform} from './HmIPPlatform';
import {HmIPDevice} from "./HmIPState";
import {HmIPConnector} from "./HmIPConnector";

interface WallMountedThermostatProChannel {
    functionalChannelType: string;
    actualTemperature: number;
    setPointTemperature: number;
    humidity: number;
}

export interface Updateable {
    updateDevice(device: HmIPDevice): void;
}

/**
 * HomematicIP Thermostat
 */
export class HmIPThermostat implements Updateable {
    private service: Service;

    private actualTemperature: number = 0;
    private setPointTemperature: number = 0;
    private humidity: number = 0;

    constructor(
        private readonly platform: HmIPPlatform,
        private readonly accessory: PlatformAccessory,
        private readonly connector: HmIPConnector
    ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.oem)
            .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.modelType)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion);

        this.service = this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

        this.updateDevice(accessory.context.device);

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
        this.platform.log.debug('Triggered GET CurrentHeatingCoolingState');
        callback(null, this.platform.Characteristic.CurrentHeatingCoolingState.HEAT);
    }

    handleTargetHeatingCoolingStateGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug('Triggered GET TargetHeatingCoolingState');
        callback(null, this.platform.Characteristic.CurrentHeatingCoolingState.HEAT);
    }

    handleTargetHeatingCoolingStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.platform.log.debug('Triggered SET TargetHeatingCoolingState:', value);
        callback(null);
    }

    handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug('Triggered GET CurrentTemperature');
        callback(null, this.actualTemperature);
    }

    handleTargetTemperatureGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug('Triggered GET TargetTemperature');
        callback(null, this.setPointTemperature);
    }

    handleTargetTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.platform.log.debug('Triggered SET TargetTemperature:', value);
        callback(null);
    }

    handleTemperatureDisplayUnitsGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug('Triggered GET TemperatureDisplayUnits');
        callback(null, this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
    }

    handleTemperatureDisplayUnitsSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.platform.log.debug('Triggered SET TemperatureDisplayUnits:', value);
        callback(null);
    }

    handleCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
        this.platform.log.debug('Triggered GET CurrentRelativeHumidity');
        callback(null, this.humidity);
    }

    public updateDevice(hmIPDevice: HmIPDevice) {
        this.platform.log.debug("Updating device: ", hmIPDevice.label)
        for (const id in hmIPDevice.functionalChannels) {
            const channel = hmIPDevice.functionalChannels[id];
            if (channel.functionalChannelType === 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL') {
                const wthChannel = <WallMountedThermostatProChannel> channel;

                if (wthChannel.setPointTemperature != this.setPointTemperature) {
                    this.platform.log.info("Target temperature changed: ", wthChannel.setPointTemperature);
                    this.setPointTemperature = wthChannel.setPointTemperature;
                    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.setPointTemperature);
                }

                if (wthChannel.actualTemperature != this.actualTemperature) {
                    this.platform.log.info("Current temperature changed: ", wthChannel.actualTemperature);
                    this.actualTemperature = wthChannel.actualTemperature;
                    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.actualTemperature);
                }

                if (wthChannel.humidity != this.humidity) {
                    this.platform.log.info("Current relative humidity changed: ", wthChannel.humidity);
                    this.humidity = wthChannel.humidity;
                    this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.humidity);
                }
            }
        }
    }
}