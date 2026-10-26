import assert from "node:assert/strict";
import test from "node:test";

import {HmIPRotaryHandleSensor} from "../dist/devices/HmIPRotaryHandleSensor.js";

const ContactSensorState = {CONTACT_DETECTED: 0, CONTACT_NOT_DETECTED: 1};
const PositionState = {STOPPED: 2};
const Characteristic = {
    ContactSensorState,
    CurrentPosition: "CurrentPosition",
    FirmwareRevision: "FirmwareRevision",
    Manufacturer: "Manufacturer",
    Model: "Model",
    PositionState,
    SerialNumber: "SerialNumber",
    StatusLowBattery: {},
    TargetPosition: "TargetPosition",
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

class ContactSensorService extends MockService {
    static UUID = "ContactSensor";

    constructor(displayName = "Contact Sensor", subtype) {
        super(displayName, subtype, ContactSensorService.UUID);
    }
}

class WindowService extends MockService {
    static UUID = "Window";

    constructor(displayName = "Window", subtype) {
        super(displayName, subtype, WindowService.UUID);
    }
}

const Service = {
    AccessoryInformation: "AccessoryInformation",
    Battery: "Battery",
    ContactSensor: ContactSensorService,
    Window: WindowService,
};

function createDevice(windowState = "CLOSED") {
    return {
        firmwareVersion: "1.0.0",
        functionalChannels: {
            1: {
                eventDelay: 0,
                functionalChannelType: "ROTARY_HANDLE_CHANNEL",
                windowState,
            },
        },
        homeId: "home1",
        id: "srh1",
        label: "Kitchen window",
        lastStatusUpdate: 0,
        modelType: "HmIP-SRH",
        oem: "eq-3",
        permanentlyReachable: true,
        type: "ROTARY_HANDLE_SENSOR",
    };
}

function createRotaryHandleSensor({asContactSensor = false, existingService, windowState = "CLOSED"} = {}) {
    const device = createDevice(windowState);
    const informationService = new MockService("Information", undefined, Service.AccessoryInformation);
    const accessory = {
        context: {device},
        displayName: device.label,
        services: [informationService, ...(existingService ? [existingService] : [])],
        UUID: "uuid-srh",
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
            this.services = this.services.filter((candidate) => candidate !== service);
        },
    };
    const platform = {
        api: {updatePlatformAccessories() {}},
        Characteristic,
        config: {devices: [{id: device.id, asContactSensor}]},
        groups: {},
        log: {debug() {}, info() {}, warn() {}},
        Service,
    };
    const adapter = new HmIPRotaryHandleSensor(platform, accessory);
    adapter.updateDevice(device, {});
    return {accessory, adapter, device};
}

test("keeps the three-state HomeKit window service by default", () => {
    const {accessory, adapter, device} = createRotaryHandleSensor();
    const windowService = accessory.getService(WindowService);

    assert.equal(accessory.getService(ContactSensorService), undefined);
    assert.equal(windowService.getCharacteristic(Characteristic.CurrentPosition).getter(), 0);

    adapter.updateDevice(
        {
            ...device,
            functionalChannels: {
                1: {...device.functionalChannels[1], windowState: "TILTED"},
            },
        },
        {},
    );

    assert.deepEqual(windowService.updates, [
        [Characteristic.CurrentPosition, 50],
        [Characteristic.TargetPosition, 50],
    ]);
});

test("optionally maps closed to detected and tilted or open to not detected", () => {
    const existingWindowService = new WindowService("Kitchen window");
    const {accessory, adapter, device} = createRotaryHandleSensor({
        asContactSensor: true,
        existingService: existingWindowService,
    });
    const contactService = accessory.getService(ContactSensorService);

    assert.equal(accessory.services.includes(existingWindowService), false);
    assert.equal(
        contactService.getCharacteristic(Characteristic.ContactSensorState).getter(),
        ContactSensorState.CONTACT_DETECTED,
    );

    adapter.updateDevice(
        {
            ...device,
            functionalChannels: {
                1: {...device.functionalChannels[1], windowState: "TILTED"},
            },
        },
        {},
    );

    assert.deepEqual(contactService.updates, [
        [Characteristic.ContactSensorState, ContactSensorState.CONTACT_NOT_DETECTED],
    ]);

    adapter.updateDevice(
        {
            ...device,
            functionalChannels: {
                1: {...device.functionalChannels[1], windowState: "OPEN"},
            },
        },
        {},
    );

    assert.equal(contactService.updates.length, 1);
});

test("removes a cached contact sensor when returning to the default window mode", () => {
    const existingContactService = new ContactSensorService("Kitchen window");
    const {accessory} = createRotaryHandleSensor({existingService: existingContactService});

    assert.equal(accessory.services.includes(existingContactService), false);
    assert.ok(accessory.getService(WindowService));
});
