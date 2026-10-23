import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {HmIPConnection} from '../dist/HmIPConnection.js';
import {connectedGet, connectedSet} from '../dist/HmIPAvailability.js';
import {HmIPPlatform} from '../dist/HmIPPlatform.js';

const api = {hap: {
  HAPStatus: {SERVICE_COMMUNICATION_FAILURE: -70402},
  HapStatusError: class extends Error {
    constructor(hapStatus) { super('HAP failure'); this.hapStatus = hapStatus; }
  },
}};
const log = {debug() {}, info() {}, warn() {}};
const snapshot = () => ({devices: {}, groups: {}, home: {id: 'home', functionalHomes: {}}});
const change = (...events) => ({events: Object.fromEntries(events.map((event, i) => [i, event]))});
function harness(t) {
  const requests = [];
  const states = [];
  const changes = [];
  const ready = [];
  const connection = new HmIPConnection(log, signal => new Promise((resolve, reject) => {
    requests.push({signal, resolve, reject});
  }), state => states.push(state), event => changes.push(event), value => ready.push(value), 100);
  t.after(() => connection.stop());
  return {connection, requests, states, changes, ready};
}

test('connection merges live changes into a fresh snapshot before becoming available', async t => {
  const h = harness(t);
  h.connection.connection('connected');
  assert.deepEqual(h.ready, [false]);
  const state = snapshot();
  state.devices.removed = {id: 'removed'};
  state.devices.changed = {id: 'changed', label: 'old'};
  state.groups.removed = {id: 'removed'};
  const home = {id: 'home', functionalHomes: {updated: true}};
  h.connection.change(change(
    {pushEventType: 'DEVICE_CHANGED', device: {id: 'changed', label: 'new'}},
    {pushEventType: 'DEVICE_ADDED', device: {id: 'added'}},
    {pushEventType: 'DEVICE_REMOVED', device: {id: 'removed'}},
    {pushEventType: 'GROUP_REMOVED', group: {id: 'removed'}},
    {pushEventType: 'GROUP_ADDED', group: {id: 'added', type: 'SECURITY_ZONE'}},
    {pushEventType: 'HOME_CHANGED', home},
    {pushEventType: 'DEVICE_CHANNEL_EVENT', deviceId: 'changed', channelIndex: 1, channelEventType: 'KEY_PRESS_SHORT'},
  ));
  assert.equal(h.changes.length, 0);
  h.requests[0].resolve(state);
  await nextTurn();
  assert.deepEqual(Object.keys(h.states[0].devices).sort(), ['added', 'changed']);
  assert.equal(h.states[0].devices.changed.label, 'new');
  assert.deepEqual(Object.keys(h.states[0].groups), ['added']);
  assert.equal(h.states[0].home, home);
  assert.equal(h.ready.at(-1), true);
  assert.equal(Object.values(h.changes[0].events).length, 1);
  assert.equal(Object.values(h.changes[0].events)[0].pushEventType, 'DEVICE_CHANNEL_EVENT');
  h.connection.change(change({pushEventType: 'HOME_CHANGED', home}));
  assert.equal(h.changes.length, 2);
});

test('disconnect cancels a refresh and late snapshots cannot overwrite a newer connection', async t => {
  const h = harness(t);
  h.connection.connection('connected');
  h.connection.connection('disconnected');
  assert.equal(h.requests[0].signal.aborted, true);
  h.connection.connection('reconnected');
  const current = snapshot();
  h.requests[1].resolve(current);
  await nextTurn();
  h.requests[0].resolve(snapshot());
  await nextTurn();
  assert.deepEqual(h.states, [current]);
  assert.equal(h.ready.at(-1), true);
});

test('failed snapshots retry without announcing availability or losing buffered events', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const h = harness(t);
  h.connection.connection('connected');
  const event = change({pushEventType: 'DEVICE_CHANNEL_EVENT', deviceId: 'button', channelIndex: 1, channelEventType: 'KEY_PRESS_SHORT'});
  h.connection.change(event);
  h.requests[0].resolve(false);
  await nextTurn();
  assert.equal(h.ready.at(-1), false);
  assert.deepEqual(h.changes, [event]);
  t.mock.timers.tick(100);
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(snapshot());
  await nextTurn();
  assert.equal(h.ready.at(-1), true);
  assert.deepEqual(h.changes, [event]);
});

test('shutdown prevents pending refreshes and retry timers from changing accessories', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const h = harness(t);
  h.connection.connection('connected');
  h.requests[0].reject(new Error('private response must not be logged'));
  await nextTurn();
  h.connection.stop();
  t.mock.timers.tick(1000);
  h.connection.connection('reconnected');
  h.connection.change(change({pushEventType: 'HOME_CHANGED', home: {id: 'late'}}));
  assert.equal(h.requests.length, 1);
  assert.equal(h.states.length, 0);
  assert.equal(h.changes.length, 0);
  assert.equal(h.ready.at(-1), false);
});

test('HomeKit handlers reject offline reads and writes, then recover with their original arguments', async () => {
  const platform = {connectionReady: false, api};
  let calls = 0;
  const get = connectedGet(platform, () => { calls++; return 42; });
  const set = connectedSet(platform, async value => { calls++; assert.equal(value, true); });
  const communicationFailure = error => error.hapStatus === api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;
  assert.throws(() => get(), communicationFailure);
  assert.throws(() => set(true), communicationFailure);
  assert.equal(calls, 0);
  platform.connectionReady = true;
  assert.equal(get(), 42);
  await set(true);
  assert.equal(calls, 2);
});

test('snapshot reconciliation removes missing devices and refreshes groups, devices and security together', () => {
  const platform = Object.create(HmIPPlatform.prototype);
  const removed = [];
  const updated = [];
  let securityHome;
  let reconciled;
  platform.log = log;
  platform.deviceMap = new Map([['gone', {accessories: [{UUID: 'gone'}], dispose() { removed.push('disposed'); }}]]);
  platform.accessoryRepository = {remove: id => removed.push(id), reconcile: ids => { reconciled = [...ids]; }};
  platform.updateAccessory = device => { updated.push([device.id, platform.groups]); return [device.id]; };
  platform.updateSecuritySystem = home => { securityHome = home; return 'security'; };
  const state = snapshot();
  state.devices.present = {id: 'present'};
  state.groups.zone = {id: 'zone'};
  platform.applySnapshot(state);
  assert.deepEqual(removed, ['disposed', 'gone']);
  assert.equal(platform.deviceMap.has('gone'), false);
  assert.deepEqual(updated, [['present', state.groups]]);
  assert.equal(securityHome, state.home);
  assert.deepEqual(reconciled, ['present', 'security']);
});

test('startup wires lifecycle events and refreshes again after reconnecting', async t => {
  const platform = Object.create(HmIPPlatform.prototype);
  platform.log = log;
  platform.shutdownController = new AbortController();
  platform.connectionReady = false;
  const states = [];
  const events = [];
  let onConnection;
  let onChange;
  let fetches = 0;
  platform.applySnapshot = state => states.push(state);
  platform.eventRouter = {handle: event => events.push(event)};
  platform.connector = {
    init: async () => true,
    getCurrentState: async () => { fetches++; return snapshot(); },
    connect(change, connection) { onChange = change; onConnection = connection; },
  };
  t.after(() => platform.connection?.stop());
  assert.equal(await platform.discoverDevices(), true);
  assert.equal(platform.connectionReady, false);
  onConnection('connected');
  await nextTurn();
  assert.equal(platform.connectionReady, true);
  const event = change({pushEventType: 'HOME_CHANGED', home: {id: 'home'}});
  onChange(event);
  assert.deepEqual(events, [event]);
  onConnection('disconnected');
  assert.equal(platform.connectionReady, false);
  onConnection('reconnected');
  await nextTurn();
  assert.equal(platform.connectionReady, true);
  assert.equal(fetches, 3);
  assert.equal(states.length, 3);
});

test('shutdown ignores a successful response that arrives after cancellation', async t => {
  const h = harness(t);
  h.connection.connection('connected');
  h.connection.stop();
  h.requests[0].resolve(snapshot());
  await nextTurn();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.deepEqual(h.states, []);
  assert.equal(h.ready.at(-1), false);
});
