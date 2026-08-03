import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPDimmer} from '../dist/devices/HmIPDimmer.js';

const Characteristic = {
  Brightness: 'Brightness',
  FirmwareRevision: 'FirmwareRevision',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  On: 'On',
  SerialNumber: 'SerialNumber',
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

function createDimmer(type, functionalChannels, {legacyService} = {}) {
  const commands = [];
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  const services = [informationService];
  if (legacyService) {
    services.push(legacyService);
  }
  const device = {
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

  await lightServices[0].setters.get(Characteristic.Brightness)(25);
  await lightServices[1].setters.get(Characteristic.Brightness)(50);
  await lightServices[2].setters.get(Characteristic.Brightness)(75);
  assert.deepEqual(commands, [
    ['device/control/setDimLevel', {channelIndex: 1, deviceId: 'dimmer1', dimLevel: 0.25}],
    ['device/control/setDimLevel', {channelIndex: 2, deviceId: 'dimmer1', dimLevel: 0.5}],
    ['device/control/setDimLevel', {channelIndex: 3, deviceId: 'dimmer1', dimLevel: 0.75}],
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
    [Characteristic.On, true],
    [Characteristic.Brightness, 42],
  ]);
});
