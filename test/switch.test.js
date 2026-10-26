import assert from "node:assert/strict";
import test from "node:test";

import {HmIPSwitch} from "../dist/devices/HmIPSwitch.js";

const Characteristic = {
    FirmwareRevision: "FirmwareRevision",
    Manufacturer: "Manufacturer",
    Model: "Model",
    Name: "Name",
    On: "On",
    SerialNumber: "SerialNumber",
    ServiceLabelIndex: "ServiceLabelIndex",
    StatusLowBattery: {},
};

class MockService {
    constructor(displayName, subtype, UUID) {
        this.displayName = displayName;
        this.subtype = subtype;
        this.UUID = UUID;
        this.getters = new Map();
        this.setters = new Map();
        this.updates = [];
    }

    getCharacteristic(characteristic) {
        return {
            onGet: (handler) => {
                this.getters.set(characteristic, handler);
                return this.getCharacteristic(characteristic);
            },
            onSet: (handler) => {
                this.setters.set(characteristic, handler);
                return this.getCharacteristic(characteristic);
            },
        };
    }

    setCharacteristic() {
        return this;
    }

    addOptionalCharacteristic() {
        return this;
    }

    testCharacteristic() {
        return false;
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

const Service = {
    AccessoryInformation: "AccessoryInformation",
    Battery: "Battery",
    Switch: MockSwitchService,
};

function createSwitch({
    additionalOutputs = 0,
    deviceType = "PLUGABLE_SWITCH",
    includeInput = true,
    multiOutput = false,
    noOutput = false,
    omittedState = false,
    outputChannelType = "SWITCH_CHANNEL",
} = {}) {
    const commands = [];
    const warnings = [];
    const informationService = new MockService("Information", undefined, Service.AccessoryInformation);
    const outputService = new MockSwitchService("Plug", "1");
    const secondService = new MockSwitchService(multiOutput ? "Output 2" : "Input", "2");
    const additionalOutputServices = Array.from({length: additionalOutputs}, (_, offset) => {
        const index = offset + 3;
        return new MockSwitchService(`Output ${index}`, index.toString());
    });
    const device = {
        id: "switch1",
        type: deviceType,
        label: "Plug",
        oem: "eq-3",
        modelType:
            {
                DIN_RAIL_SWITCH: "HmIP-DRSI1",
                FULL_FLUSH_INPUT_SWITCH: "HmIP-FSI16",
                FULL_FLUSH_SWITCH_COMPACT: "HmIP-FS6",
            }[deviceType] ?? "HmIP-PS-2 9YM",
        firmwareVersion: "1.0.0",
        permanentlyReachable: true,
        lastStatusUpdate: 0,
        homeId: "home1",
        functionalChannels: noOutput
            ? {
                  0: {
                      functionalChannelType: "DEVICE_BASE",
                      index: 0,
                      label: "Sensitive channel label",
                      lowBat: null,
                      unreach: false,
                      supportedOptionalFeatures: {IOptionalFeatureLowBat: false},
                  },
              }
            : {
                  1: {
                      functionalChannelType: outputChannelType,
                      index: 1,
                      ...(omittedState ? {} : {label: "", on: false}),
                  },
                  ...(includeInput
                      ? {
                            2: {
                                functionalChannelType: multiOutput
                                    ? "SWITCH_CHANNEL"
                                    : "MULTI_MODE_INPUT_SWITCH_CHANNEL",
                                index: 2,
                                label: multiOutput ? "Output 2" : "",
                                on: false,
                            },
                        }
                      : {}),
                  ...Object.fromEntries(
                      additionalOutputServices.map((service) => [
                          service.subtype,
                          {
                              functionalChannelType: "SWITCH_CHANNEL",
                              index: Number(service.subtype),
                              label: service.displayName,
                              on: false,
                          },
                      ]),
                  ),
              },
    };
    const accessory = {
        context: {device},
        displayName: "Plug",
        services: [informationService, outputService, secondService, ...additionalOutputServices],
        UUID: "uuid1",
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
        log: {
            debug() {},
            info() {},
            warn: (...args) => warnings.push(args),
        },
        Service,
    };

    const adapter = new HmIPSwitch(platform, accessory);
    return {accessory, adapter, commands, outputService, secondService, warnings};
}

test("exposes actuator channels and removes cached input-channel switches", async () => {
    const {accessory, commands, outputService} = createSwitch();
    const switchServices = accessory.services.filter((service) => service.UUID === MockSwitchService.UUID);

    assert.deepEqual(switchServices, [outputService]);
    await outputService.setters.get(Characteristic.On)(true);
    assert.deepEqual(commands, [["setSwitchState", {channelIndex: 1, deviceId: "switch1", on: true}]]);
});

test("rejects switch accessories without usable channels and logs only structural diagnostics", () => {
    const {adapter, warnings} = createSwitch({noOutput: true});

    assert.equal(adapter.hasFunctionalServices, false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /No functional services created/);
    assert.match(warnings[0].at(-1), /"type":"DEVICE_BASE"/);
    assert.doesNotMatch(JSON.stringify(warnings), /Sensitive channel label|switch1|home1/);
});

test("accepts HCU switch channels whose optional label and initial state are omitted", () => {
    const {adapter, outputService} = createSwitch({omittedState: true});

    assert.equal(adapter.hasFunctionalServices, true);
    assert.equal(outputService.getters.get(Characteristic.On)(), false);
});

test("exposes the HmIP-FSI16 multi-mode channel as its actuator output", async () => {
    const {accessory, adapter, commands, outputService} = createSwitch({
        deviceType: "FULL_FLUSH_INPUT_SWITCH",
        includeInput: false,
        outputChannelType: "MULTI_MODE_INPUT_SWITCH_CHANNEL",
    });
    const switchServices = accessory.services.filter((service) => service.UUID === MockSwitchService.UUID);

    assert.equal(adapter.hasFunctionalServices, true);
    assert.deepEqual(switchServices, [outputService]);
    await outputService.setters.get(Characteristic.On)(true);
    assert.deepEqual(commands, [["setSwitchState", {channelIndex: 1, deviceId: "switch1", on: true}]]);
});

test("exposes the HmIP-DRSI1 multi-mode channel as its actuator output", async () => {
    const {accessory, adapter, commands, outputService} = createSwitch({
        deviceType: "DIN_RAIL_SWITCH",
        includeInput: false,
        outputChannelType: "MULTI_MODE_INPUT_SWITCH_CHANNEL",
    });
    const switchServices = accessory.services.filter((service) => service.UUID === MockSwitchService.UUID);

    assert.equal(adapter.hasFunctionalServices, true);
    assert.deepEqual(switchServices, [outputService]);
    assert.equal(outputService.getters.get(Characteristic.On)(), false);
    await outputService.setters.get(Characteristic.On)(true);
    assert.deepEqual(commands, [["setSwitchState", {channelIndex: 1, deviceId: "switch1", on: true}]]);
});

test("keeps every independently controllable actuator channel", () => {
    const {accessory, outputService, secondService} = createSwitch({multiOutput: true});
    const switchServices = accessory.services.filter((service) => service.UUID === MockSwitchService.UUID);

    assert.deepEqual(switchServices, [outputService, secondService]);
    assert.deepEqual(outputService.updates, [[Characteristic.ServiceLabelIndex, 1]]);
    assert.deepEqual(secondService.updates, [[Characteristic.ServiceLabelIndex, 2]]);
});

test("exposes HmIP-FS6 as a multichannel switch", async () => {
    const {accessory, adapter, commands} = createSwitch({
        additionalOutputs: 4,
        deviceType: "FULL_FLUSH_SWITCH_COMPACT",
        multiOutput: true,
    });
    const switchServices = accessory.services.filter((service) => service.UUID === MockSwitchService.UUID);

    assert.equal(adapter.hasFunctionalServices, true);
    assert.deepEqual(
        switchServices.map((service) => service.subtype),
        ["1", "2", "3", "4", "5", "6"],
    );
    assert.deepEqual(
        switchServices.map((service) => service.updates),
        [1, 2, 3, 4, 5, 6].map((index) => [[Characteristic.ServiceLabelIndex, index]]),
    );
    await switchServices[5].setters.get(Characteristic.On)(true);
    assert.deepEqual(commands, [["setSwitchState", {channelIndex: 6, deviceId: "switch1", on: true}]]);
});
