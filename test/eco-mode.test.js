import assert from "node:assert/strict";
import test from "node:test";

import {HmIPEcoMode} from "../dist/HmIPEcoMode.js";
import {HmIPPlatform} from "../dist/HmIPPlatform.js";

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
        accessory,
        apiCalls,
        ecoMode: new HmIPEcoMode(platform, accessory),
        getOn: () => getters.get(Characteristic.On)(),
        platform,
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

test("publishes inactive cloud state over a restored switch value", () => {
    const {switchService} = createEcoMode();
    assert.deepEqual(switchService.updates, [[Characteristic.On, false]]);
});

test("supports every timed eco duration without defaulting unknown values to permanent", async () => {
    for (const [ecoDuration, duration] of [
        ["ONE", 60],
        ["TWO", 120],
        ["FOUR", 240],
        ["SIX", 360],
    ]) {
        const {apiCalls, setOn} = createEcoMode({}, {ecoDuration});
        await setOn(true);
        assert.deepEqual(apiCalls, [["home/heating/activateAbsenceWithDuration", {duration}]]);
    }
    for (const ecoDuration of [undefined, "", "UNKNOWN", "toString"]) {
        const {apiCalls, setOn} = createEcoMode({}, {ecoDuration});
        await assert.rejects(setOn(true), /supported eco duration/);
        assert.deepEqual(apiCalls, []);
        await setOn(false);
        assert.deepEqual(apiCalls, [["home/heating/deactivateAbsence", {}]]);
    }
});

test("reflects permanent mode and timed expiry without optimistic cloud state", async () => {
    const {ecoMode, getOn, setOn} = createEcoMode();
    await setOn(true);
    assert.equal(getOn(), false);
    ecoMode.updateHome(createHome({absenceType: "PERMANENT", ecoDuration: "PERMANENT"}));
    assert.equal(getOn(), true);
    ecoMode.updateHome(createHome({absenceType: "NOT_ABSENT", ecoDuration: "SIX"}));
    assert.equal(getOn(), false);
});

test("propagates command failures and prevents commands while offline", async () => {
    const {platform, setOn, getOn, apiCalls} = createEcoMode();
    platform.connector.apiCall = async () => {
        throw new Error("Cloud failure");
    };
    await assert.rejects(setOn(true), /Cloud failure/);
    assert.equal(getOn(), false);
    platform.connectionReady = false;
    platform.api = {hap: {HapStatusError: Error, HAPStatus: {SERVICE_COMMUNICATION_FAILURE: "Offline"}}};
    assert.throws(() => setOn(true), /Offline/);
    assert.throws(() => getOn(), /Offline/);
    assert.deepEqual(apiCalls, []);
});

test("reconciles eco accessories on snapshots and live changes, including removal and return", () => {
    const fixture = createEcoMode();
    const platform = Object.assign(Object.create(HmIPPlatform.prototype), fixture.platform);
    const entries = new Map();
    let registrations = 0;
    platform.api = {hap: {uuid: {generate: (id) => id}}};
    platform.deviceMap = new Map();
    platform.updateSecuritySystem = () => undefined;
    platform.accessoryRepository = {
        acquire(uuid, _displayName, home) {
            fixture.accessory.context.device = home;
            return {uuid, accessory: fixture.accessory};
        },
        register(entry) {
            entries.set(entry.uuid, entry);
            registrations++;
        },
        remove(uuid) {
            entries.delete(uuid);
        },
        reconcile(active) {
            for (const uuid of entries.keys()) {
                if (!active.has(uuid)) {
                    entries.delete(uuid);
                }
            }
        },
    };
    const snapshot = (home) => ({home, devices: {}, groups: {}});
    const activeHome = createHome({absenceType: "PERIOD", ecoDuration: "SIX"});
    const missingHome = {...activeHome, functionalHomes: {}};
    const changeHome = (home) =>
        platform.eventRouter.handle(
            {
                events: {
                    home: {pushEventType: "HOME_CHANGED", home},
                },
            },
            snapshot(home),
        );

    platform.applySnapshot(snapshot(activeHome));
    assert.equal(entries.size, 1);
    assert.equal(fixture.getOn(), true);
    platform.applySnapshot(snapshot(activeHome));
    assert.equal(registrations, 1);

    platform.applySnapshot(snapshot(missingHome));
    assert.equal(entries.size, 0);
    assert.equal(platform.ecoMode, undefined);
    changeHome(activeHome);
    assert.equal(entries.size, 1);
    changeHome(createHome({active: false}));
    assert.equal(entries.size, 0);
    assert.equal(platform.ecoMode, undefined);
    changeHome(activeHome);
    assert.equal(entries.size, 1);
    changeHome(missingHome);
    assert.equal(entries.size, 0);

    for (const config of [{hideEcoMode: true}, {devices: [{id: "HOME_ECO_MODE", hide: true}]}]) {
        platform.config = {};
        changeHome(activeHome);
        assert.equal(entries.size, 1);
        platform.config = config;
        platform.applySnapshot(snapshot(activeHome));
        assert.equal(entries.size, 0);
        assert.equal(platform.ecoMode, undefined);
    }
});
