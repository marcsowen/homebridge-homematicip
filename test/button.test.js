import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPButton} from '../dist/devices/HmIPButton.js';

const ProgrammableSwitchEvent = {
  LONG_PRESS: 2,
  SINGLE_PRESS: 0,
};
const Characteristic = {
  FirmwareRevision: 'FirmwareRevision',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  On: 'On',
  ProgrammableSwitchEvent,
  SerialNumber: 'SerialNumber',
  ServiceLabelIndex: 'ServiceLabelIndex',
  StatusLowBattery: {},
};

class MockCharacteristic {
  constructor() {
    this.events = [];
  }

  onGet(handler) {
    this.getter = handler;
    return this;
  }

  onSet(handler) {
    this.setter = handler;
    return this;
  }

  sendEventNotification(value) {
    this.events.push(value);
  }
}

class MockService {
  constructor(displayName, subtype, UUID) {
    this.displayName = displayName;
    this.subtype = subtype;
    this.UUID = UUID;
    this.characteristics = new Map();
    this.updates = [];
  }

  getCharacteristic(characteristic) {
    let instance = this.characteristics.get(characteristic);
    if (!instance) {
      instance = new MockCharacteristic();
      this.characteristics.set(characteristic, instance);
    }
    return instance;
  }

  setCharacteristic() {
    return this;
  }

  updateCharacteristic(characteristic, value) {
    this.updates.push([characteristic, value]);
    return this;
  }
}

class MockButtonService extends MockService {
  static UUID = 'StatelessProgrammableSwitch';

  constructor(displayName = 'Button', subtype) {
    super(displayName, subtype, MockButtonService.UUID);
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
  StatelessProgrammableSwitch: MockButtonService,
  Switch: MockSwitchService,
};

function createWrc6() {
  const commands = [];
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  const customButton = new MockButtonService('Custom HomeKit button', '1');
  const staleButton = new MockButtonService('Obsolete channel', '7');
  const device = {
    id: 'wrc6',
    type: 'PUSH_BUTTON_6_LED_SWITCH',
    label: 'Wall control',
    oem: 'eq-3',
    modelType: 'HmIP-WRC6-230',
    firmwareVersion: '1.0.0',
    permanentlyReachable: true,
    lastStatusUpdate: 0,
    homeId: 'home1',
    functionalChannels: {
      0: {functionalChannelType: 'DEVICE_BASE'},
      ...Object.fromEntries(Array.from({length: 6}, (_, offset) => {
        const index = offset + 1;
        return [index, {functionalChannelType: 'SINGLE_KEY_CHANNEL', index, label: ''}];
      })),
      7: {functionalChannelType: 'MULTI_MODE_INPUT_CHANNEL', index: 7, label: ''},
      8: {functionalChannelType: 'SWITCH_CHANNEL', index: 8, label: '', on: false},
      9: {functionalChannelType: 'OPTICAL_SIGNAL_CHANNEL', index: 9, label: ''},
    },
  };
  const accessory = {
    context: {device},
    displayName: 'Wall control',
    services: [informationService, customButton, staleButton],
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

  const adapter = new HmIPButton(platform, accessory);
  return {accessory, adapter, commands, customButton, device, staleButton};
}

test('HmIP-WRC6-230 exposes six buttons and its actuator output', async () => {
  const {accessory, commands, customButton, staleButton} = createWrc6();
  const buttons = accessory.services.filter(service => service.UUID === MockButtonService.UUID);
  const switches = accessory.services.filter(service => service.UUID === MockSwitchService.UUID);

  assert.equal(buttons.length, 6);
  assert.equal(buttons[0], customButton);
  assert.equal(customButton.displayName, 'Custom HomeKit button');
  assert.ok(!accessory.services.includes(staleButton));
  assert.equal(switches.length, 1);

  await switches[0].getCharacteristic(Characteristic.On).setter(true);
  assert.deepEqual(commands, [[
    'device/control/setSwitchState',
    {channelIndex: 8, deviceId: 'wrc6', on: true},
  ]]);
});

test('button channel events preserve single- and long-press behavior', () => {
  const {adapter, customButton} = createWrc6();
  const eventCharacteristic = customButton.getCharacteristic(Characteristic.ProgrammableSwitchEvent);

  adapter.channelEvent(1, 'KEY_PRESS_SHORT');
  adapter.channelEvent(1, 'KEY_PRESS_LONG_START');
  adapter.channelEvent(1, 'KEY_PRESS_SHORT');
  adapter.channelEvent(1, 'KEY_PRESS_LONG_STOP');

  assert.deepEqual(eventCharacteristic.events, [
    Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
    Characteristic.ProgrammableSwitchEvent.LONG_PRESS,
  ]);
});

test('button actuator state updates independently', () => {
  const {accessory, adapter, device} = createWrc6();
  const switchService = accessory.services.find(service => service.UUID === MockSwitchService.UUID);

  adapter.updateDevice({
    ...device,
    functionalChannels: {
      ...device.functionalChannels,
      8: {...device.functionalChannels[8], on: true},
    },
  }, {});

  assert.deepEqual(switchService.updates, [[Characteristic.On, true]]);
});
