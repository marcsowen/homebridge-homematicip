import assert from "node:assert/strict";
import test from "node:test";

import {HmIPEcoMode} from "../dist/HmIPEcoMode.js";

const Characteristic = {
    FirmwareRevision: "FirmwareRevision",
    Manufacturer: "Manufacturer",
    Model: "Model",
    On: "On",
    SerialNumber: "SerialNumber",
};

const Service = {
    AccessoryInformation: "AccessoryInformation",
    Switch: "Switch",
};

function createHome(indoorClimate) {
    return {
        currentAPVersion: "1.0.0",
        functionalHomes: {
            INDOOR_CLIMATE: {active: true, solution: "INDOOR_CLIMATE", ...indoorClimate},
        },
        id: "home",
    };
}

function createEcoMode(config = {}, indoorClimate = {absenceType: "NOT_ABSENT", ecoDuration: "PERMANENT"}) {
    const getters = new Map();
    const setters = new Map();
    const apiCalls = [];
    const informationService = {
        setCharacteristic() {
            return this;
        },
    };
    const switchService = {
        updates: [],
        getCharacteristic(characteristic) {
            return {
                onGet(handler) {
                    getters.set(characteristic, handler);
                    return this;
                },
                onSet(handler) {
                    setters.set(characteristic, handler);
                    return this;
                },
            };
        },
        updateCharacteristic(characteristic, value) {
            this.updates.push([characteristic, value]);
            return this;
        },
    };
    const accessory = {
        context: {device: createHome(indoorClimate)},
        displayName: "Eco Mode",
        getService(service) {
            return service === Service.AccessoryInformation ? informationService : switchService;
        },
        addService() {
            throw new Error("Switch service should already exist");
        },
    };
    const platform = {
        Characteristic,
        Service,
        config,
        connector: {
            async apiCall(...args) {
                apiCalls.push(args);
                return {};
            },
        },
        log: {
            debug() {},
            info() {},
        },
    };

    return {
        apiCalls,
        ecoMode: new HmIPEcoMode(platform, accessory),
        getOn: () => getters.get(Characteristic.On)(),
        setOn: setters.get(Characteristic.On),
        switchService,
    };
}

test("supports the visible eco-mode toggle and per-device option", () => {
    assert.equal(createEcoMode().ecoMode.hidden, false);
    assert.equal(createEcoMode({hideEcoMode: true}).ecoMode.hidden, true);
    assert.equal(createEcoMode({devices: [{id: "HOME_ECO_MODE", hide: true}]}).ecoMode.hidden, true);
});

test("activates eco mode permanently when configured in the app", async () => {
    const {apiCalls, setOn} = createEcoMode();
    await setOn(true);
    assert.deepEqual(apiCalls, [["home/heating/activateAbsencePermanent", {}]]);
});

test("activates eco mode with the duration configured in the app", async () => {
    const {apiCalls, setOn} = createEcoMode({}, {absenceType: "NOT_ABSENT", ecoDuration: "FOUR"});
    await setOn(true);
    assert.deepEqual(apiCalls, [["home/heating/activateAbsenceWithDuration", {duration: 240}]]);
});

test("deactivates eco mode", async () => {
    const {apiCalls, setOn} = createEcoMode({}, {absenceType: "PERIOD", ecoDuration: "TWO"});
    await setOn(false);
    assert.deepEqual(apiCalls, [["home/heating/deactivateAbsence", {}]]);
});

test("follows eco mode changes reported by the home", () => {
    const {ecoMode, getOn, switchService} = createEcoMode();
    assert.equal(getOn(), false);

    ecoMode.updateHome(createHome({absenceType: "PERIOD", ecoDuration: "ONE"}));
    assert.equal(getOn(), true);
    assert.deepEqual(switchService.updates.at(-1), [Characteristic.On, true]);

    ecoMode.updateHome(createHome({absenceType: "VACATION", ecoDuration: "ONE"}));
    assert.equal(getOn(), false);
    assert.deepEqual(switchService.updates.at(-1), [Characteristic.On, false]);
});
