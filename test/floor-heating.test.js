import assert from "node:assert/strict";
import test from "node:test";
import {HmIPDeviceFactory} from "../dist/HmIPDeviceFactory.js";
import {HmIPEventRouter} from "../dist/HmIPEventRouter.js";
import {getHmIPFloorHeatingValvePositions, isHmIPFloorHeatingDevice} from "../dist/HmIPFloorHeating.js";

const CurrentHeatingCoolingState = {COOL: 2, HEAT: 1, OFF: 0};
const TargetHeatingCoolingState = {AUTO: 3, COOL: 2, HEAT: 1, OFF: 0};
const Characteristic = {
    CurrentHeatingCoolingState,
    CurrentRelativeHumidity: "CurrentRelativeHumidity",
    CurrentTemperature: "CurrentTemperature",
    FirmwareRevision: "FirmwareRevision",
    Manufacturer: "Manufacturer",
    Model: "Model",
    SerialNumber: "SerialNumber",
    StatusLowBattery: {},
    TargetHeatingCoolingState,
    TargetTemperature: "TargetTemperature",
    TemperatureDisplayUnits: {CELSIUS: 0},
};

const log = {
    debug() {},
    error() {},
    info() {},
    warn() {},
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

    setProps() {
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

    addOptionalCharacteristic() {
        return this;
    }

    emit() {}

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

class ThermostatService extends MockService {
    static UUID = "Thermostat";

    constructor(displayName = "Thermostat", subtype) {
        super(displayName, subtype, "Thermostat");
    }
}

const Service = {AccessoryInformation: "AccessoryInformation", Thermostat: ThermostatService};

function createAccessory(device, services = []) {
    return {
        context: {device},
        displayName: device.label,
        services: [new MockService("Information", undefined, Service.AccessoryInformation), ...services],
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
        removeService(service) {
            this.services.splice(this.services.indexOf(service), 1);
        },
    };
}

function createPlatform(groups, floorHeatingValvePositions = new Map()) {
    class MockHistoryService {
        addEntry() {}
    }

    return {
        api: {
            hap: {Service: MockService},
            updatePlatformAccessories() {},
            user: {storagePath: () => "/tmp"},
        },
        Characteristic,
        config: {},
        connectionReady: true,
        connector: {async command() {}},
        customCharacteristic: {characteristic: {ValvePosition: "ValvePosition"}},
        FakeGatoHistoryService: MockHistoryService,
        getFloorHeatingValvePosition: (groupId) => floorHeatingValvePositions.get(groupId) ?? null,
        groups,
        log,
        Service,
    };
}

function heatingGroup(id, valvePosition = null) {
    return {
        id,
        type: "HEATING",
        label: id,
        cooling: false,
        setPointTemperature: 20,
        actualTemperature: 19.8,
        humidity: 51,
        minTemperature: 5,
        maxTemperature: 30,
        controlMode: "AUTOMATIC",
        valvePosition,
    };
}

function mechanicChannel(index, groups, valvePosition) {
    return {
        functionalChannelType: "FLOOR_TERMINAL_BLOCK_MECHANIC_CHANNEL",
        index,
        groups,
        valvePosition,
        valveState: "ADAPTION_DONE",
    };
}

// Channel layout follows a cloud record of an HmIP-FALMOT-C12: unused channels carry no valvePosition.
function floorHeatingDevice(channels) {
    return {
        id: "falmot1",
        type: "FLOOR_TERMINAL_BLOCK_12",
        label: "Floor heating controller",
        modelType: "HmIP-FALMOT-C12",
        functionalChannels: {
            0: {functionalChannelType: "DEVICE_BASE_FLOOR_HEATING", index: 0, groups: ["meta1"]},
            ...channels,
            13: {functionalChannelType: "HEAT_DEMAND_CHANNEL", index: 13, groups: []},
        },
    };
}

function wallThermostat(groupId) {
    return {
        id: "thermostat1",
        type: "WALL_MOUNTED_THERMOSTAT_BASIC_HUMIDITY",
        label: "Wall thermostat",
        oem: "eq-3",
        modelType: "HmIP-WTH-B",
        firmwareVersion: "1.0.0",
        permanentlyReachable: true,
        lastStatusUpdate: 0,
        homeId: "home1",
        functionalChannels: {
            1: {
                functionalChannelType: "WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL",
                index: 1,
                groups: [groupId],
                setPointTemperature: 20,
                actualTemperature: 19.8,
                humidity: 51,
            },
        },
    };
}

function createThermostat(groups, floorHeatingValvePositions) {
    const device = wallThermostat("room1");
    const service = new ThermostatService();
    const accessory = createAccessory(device, [service]);
    const platform = createPlatform(groups, floorHeatingValvePositions);
    const adapter = new HmIPDeviceFactory(platform).create(device, accessory);
    assert.ok(adapter);
    return {adapter, device, service};
}

test("recognizes floor heating controllers by device type", () => {
    assert.equal(isHmIPFloorHeatingDevice({type: "FLOOR_TERMINAL_BLOCK_12"}), true);
    assert.equal(isHmIPFloorHeatingDevice({type: "FLOOR_TERMINAL_BLOCK_6"}), true);
    assert.equal(isHmIPFloorHeatingDevice({type: "WALL_MOUNTED_THERMOSTAT_PRO"}), false);
});

test("collects the highest valve position per heating group from floor heating channels", () => {
    const positions = getHmIPFloorHeatingValvePositions({
        falmot1: floorHeatingDevice({
            1: mechanicChannel(1, ["room1"], 0.31),
            2: mechanicChannel(2, ["room1"], 0.48),
            3: mechanicChannel(3, ["room2"], 0),
            4: {functionalChannelType: "FLOOR_TERMINAL_BLOCK_MECHANIC_CHANNEL", index: 4, groups: []},
        }),
        thermostat1: wallThermostat("room3"),
    });

    assert.deepEqual([...positions].sort(), [
        ["room1", 0.48],
        ["room2", 0],
    ]);
});

test("ignores malformed floor heating channels instead of failing", () => {
    const positions = getHmIPFloorHeatingValvePositions({
        falmot1: floorHeatingDevice({
            1: mechanicChannel(1, ["room1"], "0.48"),
            2: mechanicChannel(2, "room1", 0.2),
            3: mechanicChannel(3, ["room2", 7], 0.2),
            4: null,
            5: mechanicChannel(5, ["room3"], Number.NaN),
        }),
        broken: {id: "broken", type: "FLOOR_TERMINAL_BLOCK_12"},
        untyped: {id: "untyped"},
    });

    assert.deepEqual([...positions], [["room2", 0.2]]);
});

test("wall thermostat takes its valve position from the floor heating controller of its room", () => {
    const {adapter, service} = createThermostat({room1: heatingGroup("room1")}, new Map([["room1", 0.48]]));

    assert.equal(service.getCharacteristic("ValvePosition").getter(), 48);
    assert.equal(
        service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).getter(),
        CurrentHeatingCoolingState.HEAT,
    );
    assert.deepEqual(
        service.updates.filter(([characteristic]) => characteristic === "ValvePosition"),
        [["ValvePosition", 48]],
    );
    adapter.dispose();
});

test("wall thermostat follows later floor heating valve changes", () => {
    const positions = new Map([["room1", 0.48]]);
    const groups = {room1: heatingGroup("room1")};
    const {adapter, device, service} = createThermostat(groups, positions);

    positions.set("room1", 0);
    adapter.updateDevice(device, groups);

    assert.equal(service.getCharacteristic("ValvePosition").getter(), 0);
    assert.equal(
        service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).getter(),
        CurrentHeatingCoolingState.OFF,
    );
    adapter.dispose();
});

for (const [initialPosition, actualTemperature, expectedState] of [
    [0.48, 21, CurrentHeatingCoolingState.OFF],
    [0, 19, CurrentHeatingCoolingState.HEAT],
]) {
    test(`losing a floor heating reading restores temperature-based state ${expectedState}`, () => {
        const positions = new Map([["room1", initialPosition]]);
        const groups = {room1: heatingGroup("room1")};
        const {adapter, device, service} = createThermostat(groups, positions);
        try {
            positions.clear();
            device.functionalChannels[1].actualTemperature = actualTemperature;
            service.updates.length = 0;
            adapter.updateDevice(device, groups);

            assert.equal(service.getCharacteristic("ValvePosition").getter(), 0);
            assert.equal(service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).getter(), expectedState);
            assert.ok(service.updates.some(([key, value]) => key === "ValvePosition" && value === 0));
            assert.ok(
                service.updates.some(([key, value]) => key === CurrentHeatingCoolingState && value === expectedState),
            );
            assert.equal(adapter.createHistoryEvent().valvePosition, 0);

            positions.set("room1", 0.25);
            adapter.updateDevice(device, groups);
            assert.equal(service.getCharacteristic("ValvePosition").getter(), 25);
        } finally {
            adapter.dispose();
        }
    });
}

test("losing floor heating preserves a current internal switch reading", () => {
    const positions = new Map([["room1", 0.48]]);
    const groups = {room1: heatingGroup("room1")};
    const {adapter, device, service} = createThermostat(groups, positions);
    try {
        device.functionalChannels[2] = {
            functionalChannelType: "INTERNAL_SWITCH_CHANNEL",
            index: 2,
            valvePosition: 0.3,
        };
        positions.clear();
        adapter.updateDevice(device, groups);
        assert.equal(service.getCharacteristic("ValvePosition").getter(), 30);
    } finally {
        adapter.dispose();
    }
});

test("removing a thermostat's heating group clears its old floor heating reading", () => {
    const {adapter, device, service} = createThermostat({room1: heatingGroup("room1")}, new Map([["room1", 0.48]]));
    try {
        adapter.updateDevice(device, {});
        assert.equal(service.getCharacteristic("ValvePosition").getter(), 0);
    } finally {
        adapter.dispose();
    }
});

test("a valve position reported by the heating group wins over the floor heating controller", () => {
    const {adapter, service} = createThermostat({room1: heatingGroup("room1", 0.1)}, new Map([["room1", 0.48]]));

    assert.equal(service.getCharacteristic("ValvePosition").getter(), 10);
    adapter.dispose();
});

test("wall thermostat without floor heating circuit keeps reporting no valve position", () => {
    const {adapter, service} = createThermostat({room1: heatingGroup("room1")});

    assert.equal(service.getCharacteristic("ValvePosition").getter(), 0);
    assert.deepEqual(
        service.updates.filter(([characteristic]) => characteristic === "ValvePosition"),
        [],
    );
    adapter.dispose();
});

test("floor heating controller changes refresh all device adapters", () => {
    const updates = [];
    const thermostat = wallThermostat("room1");
    const falmot = floorHeatingDevice({1: mechanicChannel(1, ["room1"], 0.2)});
    const state = {
        devices: {falmot1: falmot, thermostat1: thermostat},
        groups: {room1: heatingGroup("room1")},
        home: {id: "home1"},
    };
    const devices = new Map([
        [
            "thermostat1",
            {
                accessory: {},
                hidden: false,
                updateDevice: (updatedDevice, groups) => updates.push([updatedDevice.id, Object.keys(groups)]),
            },
        ],
    ]);
    const router = new HmIPEventRouter(log, state, devices, {
        addDevice() {},
        removeDevice() {},
        updateHome() {},
        updateSecurityGroups() {},
    });

    router.handle({
        events: {
            valve: {
                pushEventType: "DEVICE_CHANGED",
                device: floorHeatingDevice({1: mechanicChannel(1, ["room1"], 0.6)}),
            },
        },
    });

    assert.deepEqual(updates, [["thermostat1", ["room1"]]]);
});

test("changes of other unregistered devices do not refresh device adapters", () => {
    const updates = [];
    const state = {
        devices: {thermostat1: wallThermostat("room1")},
        groups: {},
        home: {id: "home1"},
    };
    const devices = new Map([["thermostat1", {accessory: {}, hidden: false, updateDevice: () => updates.push(1)}]]);
    const router = new HmIPEventRouter(log, state, devices, {
        addDevice() {},
        removeDevice() {},
        updateHome() {},
        updateSecurityGroups() {},
    });

    router.handle({
        events: {
            accessPoint: {
                pushEventType: "DEVICE_CHANGED",
                device: {id: "ap1", type: "HOME_CONTROL_ACCESS_POINT", modelType: "HmIP-HAP"},
            },
        },
    });

    assert.deepEqual(updates, []);
});

test("removing a floor heating controller refreshes all device adapters", () => {
    const updates = [];
    const state = {
        devices: {
            falmot1: floorHeatingDevice({1: mechanicChannel(1, ["room1"], 0.2)}),
            thermostat1: wallThermostat("room1"),
        },
        groups: {room1: heatingGroup("room1")},
        home: {id: "home1"},
    };
    const devices = new Map([
        ["thermostat1", {accessory: {}, hidden: false, updateDevice: (device) => updates.push(device.id)}],
    ]);
    const router = new HmIPEventRouter(log, state, devices, {
        addDevice() {},
        removeDevice() {},
        updateHome() {},
        updateSecurityGroups() {},
    });

    router.handle({
        events: {removed: {pushEventType: "DEVICE_REMOVED", device: {id: "falmot1", modelType: "HmIP-FALMOT-C12"}}},
    });

    assert.deepEqual(updates, ["thermostat1"]);
});
