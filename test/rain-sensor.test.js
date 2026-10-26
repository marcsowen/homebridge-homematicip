import assert from "node:assert/strict";
import test from "node:test";
import {HmIPRainSensor} from "../dist/devices/HmIPRainSensor.js";
import {getHmIPDeviceKind} from "../dist/HmIPDeviceFactory.js";

const OccupancyDetected = {OCCUPANCY_DETECTED: 1, OCCUPANCY_NOT_DETECTED: 0};
const Characteristic = {
    FirmwareRevision: "FirmwareRevision",
    Manufacturer: "Manufacturer",
    Model: "Model",
    OccupancyDetected,
    SerialNumber: "SerialNumber",
    StatusLowBattery: {},
};

class MockCharacteristic {
    onGet(handler) {
        this.getter = handler;
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

class OccupancySensorService extends MockService {
    static UUID = "OccupancySensor";

    constructor(displayName = "Occupancy", subtype) {
        super(displayName, subtype, OccupancySensorService.UUID);
    }
}

const Service = {
    AccessoryInformation: "AccessoryInformation",
    Battery: "Battery",
    OccupancySensor: OccupancySensorService,
};

function createDevice(overrides = {}) {
    return {
        firmwareVersion: "1.0.0",
        functionalChannels: {
            1: {
                functionalChannelType: "RAIN_DETECTION_CHANNEL",
                index: 1,
                raining: false,
                rainSensorSensitivity: 0.5,
            },
        },
        homeId: "home1",
        id: "rain1",
        label: "Garden rain",
        lastStatusUpdate: 0,
        modelType: "HmIP-SRD",
        oem: "eq-3",
        permanentlyReachable: true,
        type: "RAIN_SENSOR",
        ...overrides,
    };
}

function createRainSensor(device = createDevice()) {
    const informationService = new MockService("Information", undefined, Service.AccessoryInformation);
    const accessory = {
        context: {device},
        displayName: device.label,
        services: [informationService],
        UUID: "uuid-rain",
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
        api: {updatePlatformAccessories() {}},
        Characteristic,
        config: {},
        groups: {},
        log: {debug() {}, info() {}, warn() {}},
        Service,
    };
    const adapter = new HmIPRainSensor(platform, accessory);
    return {accessory, adapter, device};
}

test("maps HmIP-SRD rain detection to a HomeKit occupancy sensor", () => {
    const {accessory, adapter, device} = createRainSensor();
    const rainService = accessory.getService(OccupancySensorService);

    assert.equal(getHmIPDeviceKind(device), "rainSensor");
    assert.equal(adapter.hasFunctionalServices, true);
    assert.equal(rainService.getCharacteristic(OccupancyDetected).getter(), OccupancyDetected.OCCUPANCY_NOT_DETECTED);

    adapter.updateDevice(
        {
            ...device,
            functionalChannels: {
                1: {...device.functionalChannels[1], raining: true},
            },
        },
        {},
    );

    assert.deepEqual(rainService.updates, [[OccupancyDetected, OccupancyDetected.OCCUPANCY_DETECTED]]);
    assert.equal(rainService.getCharacteristic(OccupancyDetected).getter(), OccupancyDetected.OCCUPANCY_DETECTED);
});

test("rejects HmIP-SRD records without a valid rain detection channel", () => {
    const {accessory, adapter} = createRainSensor(
        createDevice({
            functionalChannels: {
                1: {
                    functionalChannelType: "RAIN_DETECTION_CHANNEL",
                    index: 1,
                    raining: "unknown",
                    rainSensorSensitivity: 0.5,
                },
            },
        }),
    );

    assert.equal(adapter.hasFunctionalServices, false);
    assert.equal(accessory.getService(OccupancySensorService), undefined);
});
