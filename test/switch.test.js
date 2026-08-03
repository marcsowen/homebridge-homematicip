import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPSwitch} from '../dist/devices/HmIPSwitch.js';

const Characteristic = {
  FirmwareRevision: 'FirmwareRevision',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  Name: 'Name',
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

  updateCharacteristic() {
    return this;
  }
}

class MockSwitchService extends MockService {
  static UUID = 'Switch';

  constructor(displayName = 'Switch', subtype) {
    super(displayName, subtype, MockSwitchService.UUID);
  }
}

const Service = {
  AccessoryInformation: 'AccessoryInformation',
  Battery: 'Battery',
  Switch: MockSwitchService,
};

function createSwitch({multiOutput = false} = {}) {
  const commands = [];
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  const outputService = new MockSwitchService('Plug', '1');
  const secondService = new MockSwitchService(multiOutput ? 'Output 2' : 'Input', '2');
  const device = {
    id: 'switch1',
    type: 'PLUGABLE_SWITCH',
    label: 'Plug',
    oem: 'eq-3',
    modelType: 'HmIP-PS-2 9YM',
    firmwareVersion: '1.0.0',
    permanentlyReachable: true,
    lastStatusUpdate: 0,
    homeId: 'home1',
    functionalChannels: {
      1: {functionalChannelType: 'SWITCH_CHANNEL', index: 1, label: '', on: false},
      2: {
        functionalChannelType: multiOutput ? 'SWITCH_CHANNEL' : 'MULTI_MODE_INPUT_SWITCH_CHANNEL',
        index: 2,
        label: multiOutput ? 'Output 2' : '',
        on: false,
      },
    },
  };
  const accessory = {
    context: {device},
    displayName: 'Plug',
    services: [informationService, outputService, secondService],
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

  new HmIPSwitch(platform, accessory);
  return {accessory, commands, outputService, secondService};
}

test('exposes actuator channels and removes cached input-channel switches', async () => {
  const {accessory, commands, outputService} = createSwitch();
  const switchServices = accessory.services.filter(service => service.UUID === MockSwitchService.UUID);

  assert.deepEqual(switchServices, [outputService]);
  await outputService.setters.get(Characteristic.On)(true);
  assert.deepEqual(commands, [[
    'device/control/setSwitchState',
    {channelIndex: 1, deviceId: 'switch1', on: true},
  ]]);
});

test('keeps every independently controllable actuator channel', () => {
  const {accessory, outputService, secondService} = createSwitch({multiOutput: true});
  const switchServices = accessory.services.filter(service => service.UUID === MockSwitchService.UUID);

  assert.deepEqual(switchServices, [outputService, secondService]);
});
