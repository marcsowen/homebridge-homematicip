import assert from "node:assert/strict";
import test from "node:test";
import {HmIPLightSensor} from "../dist/devices/HmIPLightSensor.js";
import {HmIPWeatherSensor} from "../dist/devices/HmIPWeatherSensor.js";

// Bounds of HomeKit's Current Ambient Light Level characteristic; HAP rejects values outside them.
const HOMEKIT_MIN_LUX = 0.0001;
const HOMEKIT_MAX_LUX = 100000;

const Characteristic = {
    CurrentAmbientLightLevel: "CurrentAmbientLightLevel",
    CurrentRelativeHumidity: "CurrentRelativeHumidity",
    CurrentTemperature: "CurrentTemperature",
    FirmwareRevision: "FirmwareRevision",
    Manufacturer: "Manufacturer",
    Model: "Model",
    OccupancyDetected: {OCCUPANCY_DETECTED: 1, OCCUPANCY_NOT_DETECTED: 0},
    SerialNumber: "SerialNumber",
    StatusLowBattery: {},
    TemperatureDisplayUnits: {CELSIUS: 0},
};

class MockCharacteristic {
    onGet(handler) {
        this.getter = handler;
        return this;
    }

    setProps() {
        return this;
    }
}

class MockService {
    constructor(displayName, subtype, UUID) {
        this.characteristics = new Map();
        this.displayName = displayName;
        this.subtype = subtype;
        this.UUID = UUID;
        this.updates = [];
    }

    getCharacteristic(characteristic) {
        let instance = this.characteristics.get(characteristic);
        if (!instance) {
            instance = new MockCharacteristic();
            this.characteristics.set(characteristic, instance);
        }
        return instance;
    }

    setCharacteristic() {
        return this;
    }

    updateCharacteristic(characteristic, value) {
        this.updates.push([characteristic, value]);
        return this;
    }
}

function serviceType(UUID) {
    return class extends MockService {
        static UUID = UUID;

        constructor(displayName, subtype) {
            super(displayName, subtype, UUID);
        }
    };
}

const Service = {
    AccessoryInformation: "AccessoryInformation",
    Battery: "Battery",
    HumiditySensor: serviceType("HumiditySensor"),
    LightSensor: serviceType("LightSensor"),
    TemperatureSensor: serviceType("TemperatureSensor"),
};

function createAdapter(Adapter, device) {
    const accessory = {
        context: {device},
        displayName: device.label,
        services: [new MockService("Information", undefined, Service.AccessoryInformation)],
        UUID: `uuid-${device.id}`,
        addService(service) {
            this.services.push(service);
            return service;
        },
        getService(service) {
            return this.services.find((candidate) => candidate.UUID === service || candidate.UUID === service.UUID);
        },
        getServiceById(service, subtype) {
            return this.services.find((candidate) => candidate.UUID === service.UUID && candidate.subtype === subtype);
        },
    };
    const platform = {
        api: {
            hap: {Service: MockService},
            updatePlatformAccessories() {},
            user: {storagePath: () => "/tmp"},
        },
        Characteristic,
        config: {},
        customCharacteristic: {characteristic: {WeatherConditionCategory: "Category", WindSpeed: "WindSpeed"}},
        FakeGatoHistoryService: class {
            addEntry() {}
        },
        groups: {},
        log: {debug() {}, info() {}, warn() {}},
        Service,
    };
    const adapter = new Adapter(platform, accessory);
    const lightService = accessory.getService(Service.LightSensor);
    return {
        adapter,
        published: () => lightService.updates.filter(([type]) => type === Characteristic.CurrentAmbientLightLevel),
        read: () => lightService.getCharacteristic(Characteristic.CurrentAmbientLightLevel).getter(),
    };
}

function lightSensorRecord(averageIllumination) {
    return {
        firmwareVersion: "1.0.0",
        functionalChannels: {
            1: {
                averageIllumination,
                currentIllumination: averageIllumination,
                functionalChannelType: "LIGHT_SENSOR_CHANNEL",
                highestIllumination: averageIllumination,
                index: 1,
                lowestIllumination: averageIllumination,
            },
        },
        homeId: "home1",
        id: "slo1",
        label: "Light outdoor",
        lastStatusUpdate: 0,
        modelType: "HmIP-SLO",
        oem: "eq-3",
        permanentlyReachable: false,
        type: "LIGHT_SENSOR",
    };
}

function weatherSensorRecord(illumination) {
    return {
        firmwareVersion: "1.0.0",
        functionalChannels: {
            1: {
                actualTemperature: 8.1,
                functionalChannelType: "WEATHER_SENSOR_CHANNEL",
                humidity: 81,
                illumination,
                index: 1,
                sunshine: false,
                storm: false,
                windSpeed: 0,
            },
        },
        homeId: "home1",
        id: "swo1",
        label: "Weather",
        lastStatusUpdate: 0,
        modelType: "HmIP-SWO-B",
        oem: "eq-3",
        permanentlyReachable: false,
        type: "WEATHER_SENSOR",
    };
}

test("keeps HmIP-SLO darkness within HomeKit's minimum light level", () => {
    const {adapter, published, read} = createAdapter(HmIPLightSensor, lightSensorRecord(0));

    adapter.updateDevice(lightSensorRecord(0), {});
    assert.equal(read(), HOMEKIT_MIN_LUX);

    adapter.updateDevice(lightSensorRecord(0.01), {});
    adapter.updateDevice(lightSensorRecord(0), {});
    assert.deepEqual(published(), [
        [Characteristic.CurrentAmbientLightLevel, 0.01],
        [Characteristic.CurrentAmbientLightLevel, HOMEKIT_MIN_LUX],
    ]);
    assert.equal(read(), HOMEKIT_MIN_LUX);
});

test("keeps HmIP-SLO sunlight within HomeKit's maximum light level", () => {
    const {adapter, published, read} = createAdapter(HmIPLightSensor, lightSensorRecord(0));

    adapter.updateDevice(lightSensorRecord(120000), {});

    assert.deepEqual(published(), [[Characteristic.CurrentAmbientLightLevel, HOMEKIT_MAX_LUX]]);
    assert.equal(read(), HOMEKIT_MAX_LUX);
});

test("keeps weather sensor illumination within HomeKit's light level range", (t) => {
    const {adapter, published, read} = createAdapter(HmIPWeatherSensor, weatherSensorRecord(3435));
    t.after(() => adapter.dispose());

    adapter.updateDevice(weatherSensorRecord(3435), {});
    adapter.updateDevice(weatherSensorRecord(0), {});
    assert.equal(read(), HOMEKIT_MIN_LUX);

    adapter.updateDevice(weatherSensorRecord(120000), {});
    assert.equal(read(), HOMEKIT_MAX_LUX);
    assert.deepEqual(published(), [
        [Characteristic.CurrentAmbientLightLevel, 3435],
        [Characteristic.CurrentAmbientLightLevel, HOMEKIT_MIN_LUX],
        [Characteristic.CurrentAmbientLightLevel, HOMEKIT_MAX_LUX],
    ]);
});
