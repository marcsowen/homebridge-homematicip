import assert from "node:assert/strict";
import test from "node:test";

import {HmIPSwitchNotificationLight} from "../dist/devices/HmIPSwitchNotificationLight.js";

const Characteristic = {
    Brightness: "Brightness",
    FirmwareRevision: "FirmwareRevision",
    Hue: "Hue",
    Manufacturer: "Manufacturer",
    Model: "Model",
    On: "On",
    Saturation: "Saturation",
    SerialNumber: "SerialNumber",
    ServiceLabelIndex: "ServiceLabelIndex",
    StatusLowBattery: {},
};

class MockCharacteristic {
    onGet(handler) {
        this.getter = handler;
        return this;
    }

    onSet(handler) {
        this.setter = handler;
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

    addOptionalCharacteristic() {
        return this;
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

    testCharacteristic(characteristic) {
        return this.characteristics.has(characteristic);
    }

    updateCharacteristic(characteristic, value) {
        this.updates.push([characteristic, value]);
        return this;
    }
}

class MockSwitchService extends MockService {
    static UUID = "Switch";

    constructor(displayName = "Switch", subtype) {
        super(displayName, subtype, MockSwitchService.UUID);
    }
}

class MockLightbulbService extends MockService {
    static UUID = "Lightbulb";

    constructor(displayName = "Light", subtype) {
        super(displayName, subtype, MockLightbulbService.UUID);
    }
}

const Service = {
    AccessoryInformation: "AccessoryInformation",
    Battery: "Battery",
    Lightbulb: MockLightbulbService,
    Switch: MockSwitchService,
};

function notificationChannel(index, label) {
    return {
        dimLevel: 0,
        functionalChannelType: "NOTIFICATION_LIGHT_CHANNEL",
        index,
        label,
        on: false,
        opticalSignalBehaviour: "OFF",
        profileMode: "AUTOMATIC",
        simpleRGBColorState: "BLACK",
        supportedOptionalFeatures: {IFeatureOpticalSignalBehaviourState: false},
        userDesiredProfileMode: "AUTOMATIC",
    };
}

test("labels both HmIP-BSL notification-light services and applies colors after black", async () => {
    const commands = [];
    const informationService = new MockService("Information", undefined, Service.AccessoryInformation);
    const device = {
        firmwareVersion: "1.0.0",
        functionalChannels: {
            1: {
                functionalChannelType: "SWITCH_CHANNEL",
                on: false,
                profileMode: "AUTOMATIC",
                userDesiredProfileMode: "AUTOMATIC",
            },
            2: notificationChannel(2, "Top light"),
            3: notificationChannel(3, "Bottom light"),
        },
        homeId: "home1",
        id: "bsl1",
        label: "Notification switch",
        lastStatusUpdate: 0,
        modelType: "HmIP-BSL",
        oem: "eq-3",
        permanentlyReachable: true,
        type: "BRAND_SWITCH_NOTIFICATION_LIGHT",
    };
    const accessory = {
        context: {device},
        displayName: device.label,
        services: [informationService],
        UUID: "uuid-bsl",
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
        removeService(service) {
            this.services.splice(this.services.indexOf(service), 1);
        },
    };
    const platform = {
        api: {updatePlatformAccessories() {}},
        Characteristic,
        config: {},
        connector: {
            async command(...args) {
                commands.push(args);
            },
        },
        customCharacteristic: {characteristic: {OpticalSignal: "OpticalSignal"}},
        groups: {},
        log: {debug() {}, error() {}, info() {}, warn() {}},
        Service,
    };

    new HmIPSwitchNotificationLight(platform, accessory);

    const topLight = accessory.getServiceById(MockLightbulbService, "Button1");
    const bottomLight = accessory.getServiceById(MockLightbulbService, "Button2");
    assert.deepEqual(topLight.updates, [[Characteristic.ServiceLabelIndex, 1]]);
    assert.deepEqual(bottomLight.updates, [[Characteristic.ServiceLabelIndex, 2]]);

    await topLight.getCharacteristic(Characteristic.Hue).setter(120);
    await topLight.getCharacteristic(Characteristic.Saturation).setter(100);
    assert.deepEqual(commands.at(-1), [
        "setSimpleRGBColorDimLevel",
        {
            channelIndex: 2,
            deviceId: "bsl1",
            dimLevel: 0,
            simpleRGBColorState: "GREEN",
        },
    ]);
});
