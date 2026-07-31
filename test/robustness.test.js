import assert from 'node:assert/strict';
import test from 'node:test';
import {HmIPAccessoryRepository} from '../dist/HmIPAccessoryRepository.js';
import {HmIPConnector} from '../dist/HmIPConnector.js';
import {getHmIPDeviceKind} from '../dist/HmIPDeviceFactory.js';
import {HmIPEventRouter} from '../dist/HmIPEventRouter.js';
import {isHmIPState, isHmIPStateChange, parseHmIPStateChange} from '../dist/HmIPState.js';
import {HmIPGenericDevice} from '../dist/devices/HmIPGenericDevice.js';

const log = {
  debug() {},
  error() {},
  info() {},
  log() {},
  prefix: '',
  success() {},
  warn() {},
};

class MockPlatformAccessory {
  constructor(displayName, UUID) {
    this.context = {};
    this.displayName = displayName;
    this.UUID = UUID;
  }
}

function createAccessoryApi() {
  const calls = {registered: [], removed: [], updated: []};
  return {
    api: {
      platformAccessory: MockPlatformAccessory,
      registerPlatformAccessories: (_plugin, _platform, accessories) => calls.registered.push(...accessories),
      unregisterPlatformAccessories: (_plugin, _platform, accessories) => calls.removed.push(...accessories),
      updatePlatformAccessories: accessories => calls.updated.push(...accessories),
    },
    calls,
  };
}

test('validates the minimum usable Homematic IP state shape', () => {
  const state = {
    devices: {
      device1: {
        id: 'device1',
        type: 'PLUGABLE_SWITCH',
        label: 'Switch',
        oem: 'eq-3',
        modelType: 'HmIP-PS',
        firmwareVersion: '1.0.0',
        permanentlyReachable: true,
        lastStatusUpdate: 0,
        homeId: 'home1',
        functionalChannels: {},
      },
    },
    groups: {},
    home: {id: 'home1', currentAPVersion: '1.0.0', functionalHomes: {}},
  };

  assert.equal(isHmIPState(state), true);
  assert.equal(isHmIPState({...state, devices: {device1: {...state.devices.device1, functionalChannels: null}}}), false);
  assert.equal(isHmIPState({...state, devices: {
    device1: {...state.devices.device1, functionalChannels: {channel1: {}}},
  }}), false);
  assert.equal(isHmIPState({...state, home: {}}), false);
  assert.equal(isHmIPState({...state, home: {
    ...state.home,
    functionalHomes: {security: {solution: 'SECURITY_AND_ALARM'}},
  }}), false);
});

test('rejects malformed websocket event envelopes', () => {
  assert.equal(isHmIPStateChange({events: {event1: {pushEventType: 'HOME_CHANGED'}}}), false);
  assert.equal(isHmIPStateChange({events: {
    event1: {pushEventType: 'DEVICE_ADDED', device: {id: 'incomplete'}},
  }}), false);
  assert.equal(isHmIPStateChange({events: {event1: {pushEventType: 'FUTURE_EVENT', value: 42}}}), true);
  assert.equal(isHmIPStateChange({events: {event1: {}}}), false);
  assert.equal(isHmIPStateChange({events: []}), false);
});

test('normalizes optional channel fields and unknown event types', () => {
  const result = parseHmIPStateChange({events: {
    channel: {pushEventType: 'DEVICE_CHANNEL_EVENT', deviceId: 'button1'},
    future: {pushEventType: 'FUTURE_EVENT', value: 42},
  }});
  assert.equal(result.success, true);
  if (!result.success) {
    assert.fail(result.error);
  }

  assert.deepEqual(result.value.events.channel, {
    pushEventType: 'DEVICE_CHANNEL_EVENT',
    deviceId: 'button1',
    channelIndex: 1,
    channelEventType: '',
  });
  assert.equal(result.value.events.future?.pushEventType, 'UNKNOWN');
  assert.equal(result.value.events.future?.sourcePushEventType, 'FUTURE_EVENT');
});

test('reports the event that failed websocket validation', () => {
  const result = parseHmIPStateChange({events: {
    brokenDevice: {pushEventType: 'DEVICE_ADDED', device: {id: 'incomplete'}},
  }});

  assert.deepEqual(result, {
    success: false,
    error: 'event brokenDevice: DEVICE_ADDED.device is invalid',
  });
});

test('command rejects unsuccessful API calls', async () => {
  const connector = new HmIPConnector(log, '3014-1234', 'token');
  connector.apiCall = async () => false;

  await assert.rejects(
    connector.command('device/control/setSwitchState', {on: true}),
    /Homematic IP command failed/,
  );
});

test('connector shares and caches endpoint initialization', async () => {
  let lookupCalls = 0;
  const fetchImplementation = async url => {
    assert.equal(url, 'https://lookup.homematic.com:48335/getHost');
    lookupCalls += 1;
    await Promise.resolve();
    return {
      json: async () => ({urlREST: 'https://rest.example', urlWebSocket: 'wss://ws.example'}),
      ok: true,
      status: 200,
      statusText: 'OK',
    };
  };
  const connector = new HmIPConnector(log, '3014-1234', 'token', undefined, fetchImplementation);

  assert.deepEqual(await Promise.all([connector.init(), connector.init()]), [true, true]);
  assert.equal(await connector.init(), true);
  assert.equal(lookupCalls, 1);
  connector.shutdown();
});

test('connector shutdown aborts an in-flight REST request', async () => {
  let requestStarted;
  const started = new Promise(resolve => {
    requestStarted = resolve;
  });
  const fetchImplementation = async (url, options) => {
    if (url === 'https://lookup.homematic.com:48335/getHost') {
      return {
        json: async () => ({urlREST: 'https://rest.example', urlWebSocket: 'wss://ws.example'}),
        ok: true,
        status: 200,
        statusText: 'OK',
      };
    }
    requestStarted();
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), {once: true});
    });
  };
  const connector = new HmIPConnector(log, '3014-1234', 'token', undefined, fetchImplementation);
  assert.equal(await connector.init(), true);

  const request = connector.apiCall('home/getCurrentState');
  await started;
  connector.shutdown();

  assert.equal(await request, false);
  assert.equal(await connector.init(), false);
});

test('repository reuses newly registered accessories as cached entries', () => {
  const {api, calls} = createAccessoryApi();
  const repository = new HmIPAccessoryRepository(api, log, {device1: {hide: true}});
  const first = repository.acquire('uuid1', 'Switch', {id: 'device1'});

  repository.register(first);
  const second = repository.acquire('uuid1', 'Renamed switch', {id: 'device1'});
  repository.register(second);

  assert.equal(first.accessory, second.accessory);
  assert.deepEqual(second.accessory.context.config, {hide: true});
  assert.equal(repository.size, 1);
  assert.deepEqual(calls.registered, [first.accessory]);
  assert.deepEqual(calls.updated, [first.accessory]);
});

test('repository reconciliation unregisters and forgets stale accessories', () => {
  const {api, calls} = createAccessoryApi();
  const repository = new HmIPAccessoryRepository(api, log);
  const restored = new MockPlatformAccessory('Old switch', 'stale-uuid');
  restored.context.device = {id: 'old-device', label: 'Original HmIP name'};

  assert.equal(repository.restore(restored), true);
  assert.equal(repository.restore(restored), false);
  const acquired = repository.acquire('stale-uuid', 'Renamed HmIP device', {
    id: 'old-device',
    label: 'Renamed HmIP device',
  });
  assert.equal(acquired.accessory.displayName, 'Old switch');
  assert.equal(acquired.accessory.context.device.label, 'Original HmIP name');
  repository.reconcile(new Set());

  assert.equal(repository.size, 0);
  assert.equal(repository.get('stale-uuid'), undefined);
  assert.deepEqual(calls.removed, [restored]);
});

test('device updates publish firmware without changing HomeKit names', () => {
  const characteristicUpdates = [];
  const persistedAccessories = [];
  const informationService = {
    setCharacteristic() {
      return this;
    },
    updateCharacteristic(characteristic, value) {
      characteristicUpdates.push([characteristic, value]);
      return this;
    },
  };
  const platform = {
    api: {updatePlatformAccessories: accessories => persistedAccessories.push(...accessories)},
    Characteristic: {
      FirmwareRevision: 'firmwareRevision',
      Manufacturer: 'manufacturer',
      Model: 'model',
      SerialNumber: 'serialNumber',
      StatusLowBattery: {},
    },
    config: {},
    log,
    Service: {AccessoryInformation: 'accessoryInformation', Battery: 'battery'},
  };
  const originalDevice = {
    id: 'device1',
    type: 'PLUGABLE_SWITCH',
    label: 'Original HmIP name',
    oem: 'eq-3',
    modelType: 'HmIP-PS',
    firmwareVersion: '1.0.0',
    permanentlyReachable: true,
    lastStatusUpdate: 0,
    homeId: 'home1',
    functionalChannels: {},
  };
  const accessory = {
    context: {device: {...originalDevice}},
    displayName: 'Custom Apple Home name',
    UUID: 'uuid1',
    getService: service => service === 'accessoryInformation' ? informationService : undefined,
  };
  class TestDevice extends HmIPGenericDevice {}
  const device = new TestDevice(platform, accessory);

  device.updateDevice({
    ...originalDevice,
    label: 'Renamed HmIP device',
    firmwareVersion: '2.0.0',
  }, {});

  assert.deepEqual(characteristicUpdates, [['firmwareRevision', '2.0.0']]);
  assert.equal(accessory.context.device.firmwareVersion, '2.0.0');
  assert.equal(accessory.context.device.label, 'Original HmIP name');
  assert.equal(accessory.displayName, 'Custom Apple Home name');
  assert.deepEqual(persistedAccessories, [accessory]);
});

test('maps Homematic IP device types to adapters', () => {
  const device = type => ({type});

  assert.equal(getHmIPDeviceKind(device('HEATING_THERMOSTAT')), 'heatingThermostat');
  assert.equal(getHmIPDeviceKind(device('WALL_MOUNTED_THERMOSTAT_PRO')), 'wallMountedThermostat');
  assert.equal(getHmIPDeviceKind(device('DIN_RAIL_DIMMER_3')), 'dimmerMultiChannel');
  assert.equal(getHmIPDeviceKind(device('UNKNOWN_DEVICE')), undefined);
});

test('routes dynamic devices and preserves channel index zero', () => {
  const channelEvents = [];
  const addedDevices = [];
  const state = {
    devices: {},
    groups: {},
    home: {id: 'home1'},
  };
  const devices = new Map([
    ['button1', {
      accessory: {},
      hidden: false,
      updateDevice() {},
      channelEvent: (channelIndex, eventType) => channelEvents.push([channelIndex, eventType]),
    }],
  ]);
  const router = new HmIPEventRouter(log, state, devices, {
    addDevice: device => addedDevices.push(device.id),
    removeDevice() {},
    updateHome() {},
    updateSecurityGroups() {},
  });
  const addedDevice = {id: 'switch1', type: 'PLUGABLE_SWITCH', modelType: 'HmIP-PS'};

  router.handle({events: {
    first: {pushEventType: 'DEVICE_ADDED', device: addedDevice},
    second: {
      pushEventType: 'DEVICE_CHANNEL_EVENT',
      deviceId: 'button1',
      channelIndex: 0,
      channelEventType: 'PRESS_SHORT',
    },
  }});

  assert.deepEqual(addedDevices, ['switch1']);
  assert.equal(state.devices.switch1, addedDevice);
  assert.deepEqual(channelEvents, [[0, 'PRESS_SHORT']]);
});
