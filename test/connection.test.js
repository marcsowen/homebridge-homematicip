import assert from "node:assert/strict";
import test from "node:test";
import {setImmediate as nextTurn} from "node:timers/promises";
import {connectedGet, connectedSet} from "../dist/HmIPAvailability.js";
import {HmIPPlatform} from "../dist/HmIPPlatform.js";

const api = {
    hap: {
        HAPStatus: {SERVICE_COMMUNICATION_FAILURE: -70402},
        HapStatusError: class extends Error {
            constructor(hapStatus) {
                super("HAP failure");
                this.hapStatus = hapStatus;
            }
        },
    },
};
const log = {debug() {}, info() {}, warn() {}};
const snapshot = () => ({devices: {}, groups: {}, home: {id: "home", functionalHomes: {}}});
const change = (...events) => ({events: Object.fromEntries(events.map((event, i) => [i, event]))});
test("HomeKit handlers reject offline reads and writes, then recover with their original arguments", async () => {
    const platform = {connectionReady: false, api};
    let calls = 0;
    const get = connectedGet(platform, () => {
        calls++;
        return 42;
    });
    const set = connectedSet(platform, async (value) => {
        calls++;
        assert.equal(value, true);
    });
    const communicationFailure = (error) => error.hapStatus === api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;
    assert.throws(() => get(), communicationFailure);
    assert.throws(() => set(true), communicationFailure);
    assert.equal(calls, 0);
    platform.connectionReady = true;
    assert.equal(get(), 42);
    await set(true);
    assert.equal(calls, 2);
});

test("snapshot reconciliation removes missing devices and refreshes groups, devices, security and eco mode together", () => {
    const platform = Object.create(HmIPPlatform.prototype);
    const removed = [];
    const updated = [];
    let securityHome;
    let ecoModeHome;
    let reconciled;
    platform.log = log;
    platform.deviceMap = new Map([
        [
            "gone",
            {
                accessories: [{UUID: "gone"}],
                dispose() {
                    removed.push("disposed");
                },
            },
        ],
    ]);
    platform.accessoryRepository = {
        remove: (id) => removed.push(id),
        reconcile: (ids) => {
            reconciled = [...ids];
        },
    };
    platform.updateAccessory = (device) => {
        updated.push([device.id, platform.groups]);
        return [device.id];
    };
    platform.updateSecuritySystem = (home) => {
        securityHome = home;
        return "security";
    };
    platform.updateEcoMode = (home) => {
        ecoModeHome = home;
        return "eco";
    };
    const state = snapshot();
    state.devices.present = {id: "present"};
    state.groups.zone = {id: "zone"};
    platform.applySnapshot(state);
    assert.deepEqual(removed, ["disposed", "gone"]);
    assert.equal(platform.deviceMap.has("gone"), false);
    assert.deepEqual(updated, [["present", state.groups]]);
    assert.equal(securityHome, state.home);
    assert.equal(ecoModeHome, state.home);
    assert.deepEqual(reconciled, ["present", "security", "eco"]);
});

test("startup wires lifecycle events and refreshes again after reconnecting", async (t) => {
    const platform = Object.create(HmIPPlatform.prototype);
    platform.log = log;
    platform.shutdownController = new AbortController();
    platform.connectionReady = false;
    const states = [];
    const events = [];
    let onConnection;
    let onChange;
    let fetches = 0;
    platform.applySnapshot = (state) => states.push(state);
    platform.eventRouter = {handle: (event) => events.push(event)};
    platform.connector = {
        init: async () => {},
        disconnect() {},
        getCurrentState: async () => {
            fetches++;
            return snapshot();
        },
        connect(change, connection) {
            onChange = change;
            onConnection = connection;
        },
    };
    t.after(() => platform.connection?.stop());
    assert.equal(await platform.discoverDevices(), true);
    assert.equal(platform.connectionReady, false);
    onConnection("connected");
    await nextTurn();
    assert.equal(platform.connectionReady, true);
    const event = change({pushEventType: "HOME_CHANGED", home: {id: "home"}});
    onChange(event);
    await nextTurn();
    assert.deepEqual(events, [event]);
    onConnection("disconnected");
    await nextTurn();
    assert.equal(platform.connectionReady, false);
    onConnection("reconnected");
    await nextTurn();
    assert.equal(platform.connectionReady, true);
    assert.equal(fetches, 3);
    assert.equal(states.length, 3);
});
