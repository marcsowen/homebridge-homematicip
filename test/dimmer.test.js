import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPAccessoryRepository} from '../dist/HmIPAccessoryRepository.js';
import {HmIPDimmer} from '../dist/devices/HmIPDimmer.js';
import {HmIPDimmerCollection} from '../dist/devices/HmIPDimmerCollection.js';

const Characteristic = {
  Brightness: 'Brightness',
  FirmwareRevision: 'FirmwareRevision',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  On: 'On',
  SerialNumber: 'SerialNumber',
  ServiceLabelIndex: 'ServiceLabelIndex',
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
      onGet: handler => {
        this.getters.set(characteristic, handler);
        return this.getCharacteristic(characteristic);
      },
      onSet: handler => {
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

class MockLightbulbService extends MockService {
  static UUID = 'Lightbulb';

  constructor(displayName = 'Light', subtype) {
    super(displayName, subtype, MockLightbulbService.UUID);
  }
}

const Service = {
  AccessoryInformation: 'AccessoryInformation',
  Battery: 'Battery',
  Lightbulb: MockLightbulbService,
};

function dimmerChannel(functionalChannelType, index, dimLevel = 0, label = '') {
  return {functionalChannelType, index, dimLevel, label};
}

function dimmerDevice(type, functionalChannels) {
  return {
    id: 'dimmer1',
    type,
    label: 'Dimmer',
    oem: 'eq-3',
    modelType: 'HmIP dimmer',
    firmwareVersion: '1.0.0',
    permanentlyReachable: true,
    lastStatusUpdate: 0,
    homeId: 'home1',
    functionalChannels,
  };
}

function createDimmer(type, functionalChannels, {legacyService} = {}) {
  const commands = [];
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  const services = [informationService];
  if (legacyService) {
    services.push(legacyService);
  }
  const device = dimmerDevice(type, functionalChannels);
  const accessory = {
    context: {device},
    displayName: 'Dimmer',
    services,
    UUID: 'uuid1',
    addService(service) {
      this.services.push(service);
      return service;
    },
    getService(service) {
      return this.services.find(candidate => candidate.UUID === service || candidate.UUID === service.UUID);
    },
    getServiceById(service, subtype) {
      return this.services.find(candidate => candidate.UUID === service.UUID && candidate.subtype === subtype);
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
      warn() {},
    },
    Service,
  };

  const adapter = new HmIPDimmer(platform, accessory);
  return {accessory, adapter, commands, device};
}

function createDimmerCollection(device) {
  const calls = {registered: [], removed: [], updated: []};
  const commands = [];

  class MockPlatformAccessory {
    constructor(displayName, UUID) {
      this.context = {};
      this.displayName = displayName;
      this.services = [new MockService('Information', undefined, Service.AccessoryInformation)];
      this.UUID = UUID;
    }

    addService(service) {
      this.services.push(service);
      return service;
    }

    getService(service) {
      return this.services.find(candidate => candidate.UUID === service || candidate.UUID === service.UUID);
    }

    getServiceById(service, subtype) {
      return this.services.find(candidate => candidate.UUID === service.UUID && candidate.subtype === subtype);
    }

    removeService(service) {
      this.services.splice(this.services.indexOf(service), 1);
    }
  }

  const api = {
    hap: {
      Service,
      uuid: {generate: value => `uuid-${value}`},
    },
    platformAccessory: MockPlatformAccessory,
    registerPlatformAccessories: (_plugin, _platform, accessories) => calls.registered.push(...accessories),
    unregisterPlatformAccessories: (_plugin, _platform, accessories) => calls.removed.push(...accessories),
    updatePlatformAccessories: accessories => calls.updated.push(...accessories),
  };
  const platform = {
    api,
    Characteristic,
    config: {devices: [{id: device.id, separateChannels: true}]},
    connector: {
      async command(...args) {
        commands.push(args);
      },
    },
    groups: {},
    log: {
      debug() {},
      info() {},
      warn() {},
    },
    Service,
  };
  const repository = new HmIPAccessoryRepository(api, platform.log, platform.config.devices);
  const collection = new HmIPDimmerCollection(platform, repository, device);

  return {calls, collection, commands};
}

test('exposes all HmIPW-DRD3 output channels and uses their actual indexes', async () => {
  const legacyService = new MockLightbulbService('Custom HomeKit name');
  const {accessory, commands} = createDimmer('WIRED_DIMMER_3', {
    1: dimmerChannel('DIMMER_CHANNEL', 1, 0.1),
    2: dimmerChannel('DIMMER_CHANNEL', 2, 0.2, 'Dining room'),
    3: dimmerChannel('DIMMER_CHANNEL', 3, 0.3),
    4: dimmerChannel('MULTI_MODE_INPUT_DIMMER_CHANNEL', 4),
  }, {legacyService});
  const lightServices = accessory.services.filter(service => service.UUID === MockLightbulbService.UUID);

  assert.equal(lightServices.length, 3);
  assert.equal(lightServices[0], legacyService);
  assert.equal(legacyService.displayName, 'Custom HomeKit name');
  assert.deepEqual(lightServices.map(service => service.subtype), [undefined, '2', '3']);
  assert.deepEqual(lightServices.map(service => service.updates[0]), [
    [Characteristic.ServiceLabelIndex, 1],
    [Characteristic.ServiceLabelIndex, 2],
    [Characteristic.ServiceLabelIndex, 3],
  ]);

  await lightServices[0].setters.get(Characteristic.Brightness)(25);
  await lightServices[1].setters.get(Characteristic.Brightness)(50);
  await lightServices[2].setters.get(Characteristic.Brightness)(75);
  assert.deepEqual(commands, [
    ['setDimLevel', {channelIndex: 1, deviceId: 'dimmer1', dimLevel: 0.25}],
    ['setDimLevel', {channelIndex: 2, deviceId: 'dimmer1', dimLevel: 0.5}],
    ['setDimLevel', {channelIndex: 3, deviceId: 'dimmer1', dimLevel: 0.75}],
  ]);
});

test('uses only actionable multi-mode channels for HmIP-DRDI3', () => {
  const {accessory} = createDimmer('DIN_RAIL_DIMMER_3', {
    0: dimmerChannel('DIMMER_CHANNEL', 0),
    1: dimmerChannel('MULTI_MODE_INPUT_DIMMER_CHANNEL', 1),
    2: dimmerChannel('MULTI_MODE_INPUT_DIMMER_CHANNEL', 2),
    3: dimmerChannel('MULTI_MODE_INPUT_DIMMER_CHANNEL', 3),
  });
  const lightServices = accessory.services.filter(service => service.UUID === MockLightbulbService.UUID);

  assert.deepEqual(lightServices.map(service => service.subtype), ['1', '2', '3']);
});

test('updates each dimmer channel independently', () => {
  const {accessory, adapter, device} = createDimmer('WIRED_DIMMER_3', {
    1: dimmerChannel('DIMMER_CHANNEL', 1),
    2: dimmerChannel('DIMMER_CHANNEL', 2),
  });
  const secondService = accessory.services.find(service => service.subtype === '2');

  adapter.updateDevice({
    ...device,
    functionalChannels: {
      ...device.functionalChannels,
      2: dimmerChannel('DIMMER_CHANNEL', 2, 0.42),
    },
  }, {});

  assert.deepEqual(secondService.updates, [
    [Characteristic.ServiceLabelIndex, 2],
    [Characteristic.On, true],
    [Characteristic.Brightness, 42],
  ]);
});

test('does not overwrite a scene brightness when brightness is set before on', async () => {
  const {accessory, commands} = createDimmer('PLUGGABLE_DIMMER', {
    1: dimmerChannel('DIMMER_CHANNEL', 1),
  });
  const lightService = accessory.services.find(service => service.UUID === MockLightbulbService.UUID);

  await lightService.setters.get(Characteristic.Brightness)(50);
  await lightService.setters.get(Characteristic.On)(true);

  assert.deepEqual(commands, [[
    'setDimLevel',
    {channelIndex: 1, deviceId: 'dimmer1', dimLevel: 0.5},
  ]]);
});

test('does not flash at another level when on is set before scene brightness', async () => {
  const {accessory, commands} = createDimmer('PLUGGABLE_DIMMER', {
    1: dimmerChannel('DIMMER_CHANNEL', 1),
  });
  const lightService = accessory.services.find(service => service.UUID === MockLightbulbService.UUID);

  const onRequest = lightService.setters.get(Characteristic.On)(true);
  await lightService.setters.get(Characteristic.Brightness)(50);
  await onRequest;

  assert.deepEqual(commands, [[
    'setDimLevel',
    {channelIndex: 1, deviceId: 'dimmer1', dimLevel: 0.5},
  ]]);
});

test('an off request cancels a pending delayed on request', async () => {
  const {accessory, commands} = createDimmer('PLUGGABLE_DIMMER', {
    1: dimmerChannel('DIMMER_CHANNEL', 1),
  });
  const lightService = accessory.services.find(service => service.UUID === MockLightbulbService.UUID);

  const onRequest = lightService.setters.get(Characteristic.On)(true);
  await lightService.setters.get(Characteristic.On)(false);
  await onRequest;

  assert.deepEqual(commands, [[
    'setDimLevel',
    {channelIndex: 1, deviceId: 'dimmer1', dimLevel: 0},
  ]]);
});

test('restores the last non-zero brightness when switched back on', async () => {
  const {accessory, adapter, commands, device} = createDimmer('PLUGGABLE_DIMMER', {
    1: dimmerChannel('DIMMER_CHANNEL', 1, 0.4),
  });
  const lightService = accessory.services.find(service => service.UUID === MockLightbulbService.UUID);

  await lightService.setters.get(Characteristic.On)(false);
  adapter.updateDevice({
    ...device,
    functionalChannels: {1: dimmerChannel('DIMMER_CHANNEL', 1, 0)},
  }, {});
  await lightService.setters.get(Characteristic.On)(true);

  assert.deepEqual(commands, [
    ['setDimLevel', {channelIndex: 1, deviceId: 'dimmer1', dimLevel: 0}],
    ['setDimLevel', {channelIndex: 1, deviceId: 'dimmer1', dimLevel: 0.4}],
  ]);
});

test('exposes HmIPW-DRD3 channels as stable independent accessories on demand', async () => {
  const device = dimmerDevice('WIRED_DIMMER_3', {
    1: dimmerChannel('DIMMER_CHANNEL', 1, 0.1),
    2: dimmerChannel('DIMMER_CHANNEL', 2, 0.2, 'Dining room'),
    3: dimmerChannel('DIMMER_CHANNEL', 3, 0.3),
    4: dimmerChannel('MULTI_MODE_INPUT_DIMMER_CHANNEL', 4),
  });
  const {calls, collection, commands} = createDimmerCollection(device);

  assert.deepEqual(collection.accessories.map(accessory => accessory.displayName), [
    'Dimmer 1',
    'Dining room',
    'Dimmer 3',
  ]);
  assert.deepEqual(collection.accessories.map(accessory => accessory.UUID), [
    'uuid-dimmer1:channel:1',
    'uuid-dimmer1:channel:2',
    'uuid-dimmer1:channel:3',
  ]);
  assert.deepEqual(collection.accessories.map(accessory => accessory.context.channelIndex), [1, 2, 3]);
  assert.deepEqual(collection.accessories.map(accessory =>
    accessory.services.filter(service => service.UUID === MockLightbulbService.UUID).length), [1, 1, 1]);
  assert.equal(calls.registered.length, 3);

  const secondLight = collection.accessories[1].getServiceById(MockLightbulbService, '2');
  await secondLight.setters.get(Characteristic.Brightness)(55);
  assert.deepEqual(commands, [[
    'setDimLevel',
    {channelIndex: 2, deviceId: 'dimmer1', dimLevel: 0.55},
  ]]);

  collection.updateDevice({
    ...device,
    functionalChannels: {
      1: dimmerChannel('DIMMER_CHANNEL', 1, 0.1),
      2: dimmerChannel('DIMMER_CHANNEL', 2, 0.42, 'Dining room'),
    },
  }, {});

  assert.deepEqual(secondLight.updates, [
    [Characteristic.Brightness, 42],
  ]);
  assert.deepEqual(collection.accessories.map(accessory => accessory.UUID), [
    'uuid-dimmer1:channel:1',
    'uuid-dimmer1:channel:2',
  ]);
  assert.deepEqual(calls.removed.map(accessory => accessory.UUID), ['uuid-dimmer1:channel:3']);
});

test('exposes HmIP-DRDI3 multi-mode dimmer outputs as independent accessories', () => {
  const device = dimmerDevice('DIN_RAIL_DIMMER_3', {
    0: dimmerChannel('DIMMER_CHANNEL', 0),
    1: dimmerChannel('MULTI_MODE_INPUT_DIMMER_CHANNEL', 1, 0.1),
    2: dimmerChannel('MULTI_MODE_INPUT_DIMMER_CHANNEL', 2, 0.2),
    3: dimmerChannel('MULTI_MODE_INPUT_DIMMER_CHANNEL', 3, 0.3),
  });
  const {collection} = createDimmerCollection(device);

  assert.deepEqual(collection.accessories.map(accessory => accessory.context.channelIndex), [1, 2, 3]);
  assert.deepEqual(collection.accessories.map(accessory =>
    accessory.services.filter(service => service.UUID === MockLightbulbService.UUID).length), [1, 1, 1]);
});
