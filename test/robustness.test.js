import assert from 'node:assert/strict';
import test from 'node:test';
import {HmIPAccessoryRepository} from '../dist/HmIPAccessoryRepository.js';
import {getHmIPDeviceKind, isHmIPControllerDevice} from '../dist/HmIPDeviceFactory.js';
import {HmIPEventRouter} from '../dist/HmIPEventRouter.js';
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

  for (const thermostatType of [
    'HEATING_THERMOSTAT',
    'HEATING_THERMOSTAT_THREE',
    'HEATING_THERMOSTAT_FLEX',
  ]) {
    assert.equal(getHmIPDeviceKind(device(thermostatType)), 'heatingThermostat');
  }
  assert.equal(getHmIPDeviceKind(device('WALL_MOUNTED_THERMOSTAT_PRO')), 'wallMountedThermostat');
  assert.equal(getHmIPDeviceKind(device('FULL_FLUSH_CONTACT_INTERFACE')), 'contactSensor');
  assert.equal(getHmIPDeviceKind(device('FULL_FLUSH_CONTACT_INTERFACE_6')), 'multiModeInput');
  assert.equal(getHmIPDeviceKind(device('BLIND_MODULE')), 'shading');
  for (const buttonType of [
    'PUSH_BUTTON_6_LED_SWITCH',
    'DOOR_BELL_BUTTON',
    'KEY_REMOTE_CONTROL_4',
    'KEY_REMOTE_CONTROL_KEY_MATIC',
    'REMOTE_CONTROL_8',
    'REMOTE_CONTROL_8_MODULE',
    'WIRED_PUSH_BUTTON_2',
    'WIRED_PUSH_BUTTON_6',
  ]) {
    assert.equal(getHmIPDeviceKind(device(buttonType)), 'button');
  }
  assert.equal(getHmIPDeviceKind(device('DIN_RAIL_SWITCH')), 'switch');
  assert.equal(getHmIPDeviceKind(device('STATUS_BOARD_8')), 'switch');
  assert.equal(getHmIPDeviceKind(device('MOTION_DETECTOR_SWITCH_OUTDOOR')), 'switch');
  assert.equal(getHmIPDeviceKind(device('USB_SWITCH_MEASURING')), 'switchMeasuring');
  assert.equal(getHmIPDeviceKind(device('BRAND_DIMMER')), 'dimmer');
  assert.equal(getHmIPDeviceKind(device('FULL_FLUSH_DIMMER')), 'dimmer');
  assert.equal(getHmIPDeviceKind(device('PLUGGABLE_DIMMER')), 'dimmer');
  assert.equal(getHmIPDeviceKind(device('WIRED_DIMMER_3')), 'dimmer');
  assert.equal(getHmIPDeviceKind(device('DIN_RAIL_DIMMER_3')), 'dimmer');
  assert.equal(getHmIPDeviceKind(device('UNKNOWN_DEVICE')), undefined);
});

test('recognizes HAP and HCU controller devices as infrastructure', () => {
  for (const type of ['HOME_CONTROL_ACCESS_POINT', 'ACCESS_POINT', 'WIRELESS_ACCESS_POINT_BASIC']) {
    assert.equal(isHmIPControllerDevice({type}), true);
  }
  assert.equal(isHmIPControllerDevice({type: 'PLUGABLE_SWITCH'}), false);
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

test('propagates group changes to device adapters', () => {
  const updates = [];
  const device = {id: 'thermostat1', type: 'WALL_MOUNTED_THERMOSTAT_PRO'};
  const state = {
    devices: {thermostat1: device},
    groups: {},
    home: {id: 'home1'},
  };
  const devices = new Map([['thermostat1', {
    accessory: {},
    hidden: false,
    updateDevice: (updatedDevice, groups) => updates.push([updatedDevice, {...groups}]),
  }]]);
  const router = new HmIPEventRouter(log, state, devices, {
    addDevice() {},
    removeDevice() {},
    updateHome() {},
    updateSecurityGroups() {},
  });
  const group = {id: 'room1', type: 'HEATING', setPointTemperature: 21};

  router.handle({events: {group: {pushEventType: 'GROUP_CHANGED', group}}});

  assert.deepEqual(updates, [[device, {room1: group}]]);
});
