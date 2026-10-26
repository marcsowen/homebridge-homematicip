import assert from "node:assert/strict";
import test from "node:test";

import {HmIPBlind} from "../dist/devices/HmIPBlind.js";

const PositionState = {DECREASING: 0, INCREASING: 1, STOPPED: 2};
const Characteristic = {
    CurrentHorizontalTiltAngle: "CurrentHorizontalTiltAngle",
    CurrentPosition: "CurrentPosition",
    FirmwareRevision: "FirmwareRevision",
    HoldPosition: "HoldPosition",
    Manufacturer: "Manufacturer",
    Model: "Model",
    PositionState,
    SerialNumber: "SerialNumber",
    ServiceLabelIndex: "ServiceLabelIndex",
    StatusLowBattery: {},
    TargetHorizontalTiltAngle: "TargetHorizontalTiltAngle",
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
        this.displayName = displayName;
        this.subtype = subtype;
        this.UUID = UUID;
        this.characteristics = new Map();
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

    addOptionalCharacteristic() {
        return this;
    }

    removeCharacteristic(characteristic) {
        for (const [type, candidate] of this.characteristics) {
            if (candidate === characteristic) {
                this.characteristics.delete(type);
            }
        }
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

class WindowCoveringService extends MockService {
    static UUID = "WindowCovering";

    constructor(displayName = "Blind", subtype) {
        super(displayName, subtype, WindowCoveringService.UUID);
    }
}

const Service = {
    AccessoryInformation: "AccessoryInformation",
    Battery: "Battery",
    WindowCovering: WindowCoveringService,
};

function blindChannel(
    index,
    shutterLevel,
    slatsLevel,
    label = "",
    functionalChannelType = "MULTI_MODE_INPUT_BLIND_CHANNEL",
    overrides = {},
) {
    return {
        functionalChannelType,
        index,
        label,
        processing: false,
        shutterLevel,
        slatsLevel,
        ...overrides,
    };
}

function createBlind(functionalChannels, {legacyService, type = "DIN_RAIL_BLIND_4"} = {}) {
    const commands = [];
    const device = {
        id: "blind1",
        type,
        label: "DIN rail blind",
        oem: "eq-3",
        modelType: "HmIP-DRBLI4",
        firmwareVersion: "1.0.0",
        permanentlyReachable: true,
        lastStatusUpdate: 0,
        homeId: "home1",
        functionalChannels,
    };
    const informationService = new MockService("Information", undefined, Service.AccessoryInformation);
    const services = [informationService];
    if (legacyService) {
        services.push(legacyService);
    }
    const accessory = {
        context: {device},
        displayName: device.label,
        services,
        UUID: "uuid-blind1",
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
        groups: {},
        log: {debug() {}, info() {}, warn() {}},
        Service,
    };
    const adapter = new HmIPBlind(platform, accessory);
    return {accessory, adapter, commands, device};
}

test("exposes all four HmIP-DRBLI4 blind channels and keeps a legacy service", () => {
    const legacyService = new WindowCoveringService("Living room blind");
    const {accessory} = createBlind(
        {
            1: blindChannel(1, 0.1, 0.2),
            2: blindChannel(2, 0.2, 0.3, "Kitchen blind"),
            3: blindChannel(3, 0.3, 0.4),
            4: blindChannel(4, 0.4, 0.5),
        },
        {legacyService},
    );
    const services = accessory.services.filter((service) => service.UUID === WindowCoveringService.UUID);

    assert.equal(services.length, 4);
    assert.equal(services[0], legacyService);
    assert.equal(legacyService.displayName, "Living room blind");
    assert.deepEqual(
        services.map((service) => service.subtype),
        [undefined, "2", "3", "4"],
    );
    assert.deepEqual(
        services.map((service) => service.updates[0]),
        [
            [Characteristic.ServiceLabelIndex, 1],
            [Characteristic.ServiceLabelIndex, 2],
            [Characteristic.ServiceLabelIndex, 3],
            [Characteristic.ServiceLabelIndex, 4],
        ],
    );
    assert.equal(services[1].displayName, "Kitchen blind");
});

test("controls each HmIP-DRBLI4 output through its actual channel index", async () => {
    const {accessory, commands} = createBlind({
        1: blindChannel(1, 0.1, 0.2),
        2: blindChannel(2, 0.2, 0.3),
        3: blindChannel(3, 0.3, 0.4),
        4: blindChannel(4, 0.4, 0.5),
    });
    const services = accessory.services.filter((service) => service.UUID === WindowCoveringService.UUID);

    await services[1].getCharacteristic(Characteristic.TargetPosition).setter(40);
    await services[2].getCharacteristic(Characteristic.HoldPosition).setter(false);
    await services[2].getCharacteristic(Characteristic.HoldPosition).setter(true);
    await services[3].getCharacteristic(Characteristic.TargetHorizontalTiltAngle).setter(45);

    assert.deepEqual(commands, [
        ["setShutterLevel", {channelIndex: 2, deviceId: "blind1", shutterLevel: 0.6}],
        ["stop", {channelIndex: 3, deviceId: "blind1"}],
        [
            "setSlatsLevel",
            {
                channelIndex: 4,
                deviceId: "blind1",
                shutterLevel: 0.4,
                slatsLevel: 0.75,
            },
        ],
    ]);
});

test("updates HmIP-DRBLI4 channels independently", () => {
    const {accessory, adapter, device} = createBlind({
        1: blindChannel(1, 0.1, 0.2),
        2: blindChannel(2, 0.2, 0.3),
        3: blindChannel(3, 0.3, 0.4),
        4: blindChannel(4, 0.4, 0.5),
    });
    const services = accessory.services.filter((service) => service.UUID === WindowCoveringService.UUID);

    adapter.updateDevice(
        {
            ...device,
            functionalChannels: {
                ...device.functionalChannels,
                3: {...blindChannel(3, 0.75, 0.25), processing: true},
            },
        },
        {},
    );

    assert.deepEqual(services[0].updates, [[Characteristic.ServiceLabelIndex, 1]]);
    assert.deepEqual(services[2].updates.slice(-5), [
        [Characteristic.CurrentPosition, 25],
        [Characteristic.TargetPosition, 25],
        [Characteristic.PositionState, PositionState.DECREASING],
        [Characteristic.CurrentHorizontalTiltAngle, -45],
        [Characteristic.TargetHorizontalTiltAngle, -45],
    ]);
});

test("keeps ordinary blind channels working for existing blind actuators", async () => {
    const {accessory, commands} = createBlind(
        {
            1: blindChannel(1, 0.25, 0.5, "", "BLIND_CHANNEL"),
        },
        {type: "FULL_FLUSH_BLIND"},
    );
    const service = accessory.services.find((candidate) => candidate.UUID === WindowCoveringService.UUID);

    assert.equal(service.getCharacteristic(Characteristic.CurrentPosition).getter(), 75);
    await service.getCharacteristic(Characteristic.TargetPosition).setter(50);

    assert.deepEqual(commands, [["setShutterLevel", {channelIndex: 1, deviceId: "blind1", shutterLevel: 0.5}]]);
});

test("uses the latest requested height when a scene sets height before slats", async () => {
    const {accessory, commands} = createBlind(
        {
            1: blindChannel(1, 0, 0.5, "", "BLIND_CHANNEL", {blindModeActive: true}),
        },
        {type: "FULL_FLUSH_BLIND"},
    );
    const service = accessory.services.find((candidate) => candidate.UUID === WindowCoveringService.UUID);

    await service.getCharacteristic(Characteristic.TargetPosition).setter(0);
    await service.getCharacteristic(Characteristic.TargetHorizontalTiltAngle).setter(0);

    assert.deepEqual(commands, [
        ["setShutterLevel", {channelIndex: 1, deviceId: "blind1", shutterLevel: 1}],
        [
            "setSlatsLevel",
            {
                channelIndex: 1,
                deviceId: "blind1",
                shutterLevel: 1,
                slatsLevel: 0.5,
            },
        ],
    ]);
});

test("keeps the final requested height when a scene sets slats before height", async () => {
    const {accessory, commands} = createBlind(
        {
            1: blindChannel(1, 0, 0.5, "", "BLIND_CHANNEL", {blindModeActive: true}),
        },
        {type: "FULL_FLUSH_BLIND"},
    );
    const service = accessory.services.find((candidate) => candidate.UUID === WindowCoveringService.UUID);

    await service.getCharacteristic(Characteristic.TargetHorizontalTiltAngle).setter(0);
    await service.getCharacteristic(Characteristic.TargetPosition).setter(0);

    assert.deepEqual(commands, [
        [
            "setSlatsLevel",
            {
                channelIndex: 1,
                deviceId: "blind1",
                shutterLevel: 0,
                slatsLevel: 0.5,
            },
        ],
        ["setShutterLevel", {channelIndex: 1, deviceId: "blind1", shutterLevel: 1}],
    ]);
});

test("removes slat controls when an HmIP-FBL is configured in roller mode", () => {
    const legacyService = new WindowCoveringService("Roller shutter");
    legacyService.getCharacteristic(Characteristic.CurrentHorizontalTiltAngle);
    legacyService.getCharacteristic(Characteristic.TargetHorizontalTiltAngle);

    const {accessory} = createBlind(
        {
            1: blindChannel(1, 0.25, 0.5, "", "BLIND_CHANNEL", {blindModeActive: false}),
        },
        {legacyService, type: "FULL_FLUSH_BLIND"},
    );
    const service = accessory.services.find((candidate) => candidate.UUID === WindowCoveringService.UUID);

    assert.equal(service.testCharacteristic(Characteristic.CurrentHorizontalTiltAngle), false);
    assert.equal(service.testCharacteristic(Characteristic.TargetHorizontalTiltAngle), false);
    assert.equal(service.testCharacteristic(Characteristic.TargetPosition), true);
});
