import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPMultiModeInput} from '../dist/devices/HmIPMultiModeInput.js';

const Characteristic = {
  ContactSensorState: {CONTACT_DETECTED: 0, CONTACT_NOT_DETECTED: 1},
  FirmwareRevision: 'FirmwareRevision',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  ProgrammableSwitchEvent: {LONG_PRESS: 2, SINGLE_PRESS: 0},
  SerialNumber: 'SerialNumber',
  ServiceLabelIndex: 'ServiceLabelIndex',
  StatusLowBattery: {},
};

class MockCharacteristic {
  onGet(handler) {
    this.getter = handler;
    return this;
  }

  sendEventNotification(value) {
    this.events ??= [];
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

function serviceClass(UUID) {
  return class extends MockService {
    static UUID = UUID;

    constructor(displayName = UUID, subtype) {
      super(displayName, subtype, UUID);
    }
  };
}

const ContactSensorService = serviceClass('ContactSensor');
const StatelessProgrammableSwitchService = serviceClass('StatelessProgrammableSwitch');
const Service = {
  AccessoryInformation: 'AccessoryInformation',
  Battery: serviceClass('Battery'),
  ContactSensor: ContactSensorService,
  StatelessProgrammableSwitch: StatelessProgrammableSwitchService,
};

class MockHapStatusError extends Error {
  constructor(status) {
    super(`HAP status ${status}`);
    this.status = status;
  }
}

function channel(index, multiModeInputMode, windowState, label = '', overrides = {}) {
  return {
    functionalChannelType: 'MULTI_MODE_INPUT_CHANNEL',
    index,
    label,
    multiModeInputMode,
    windowState,
    ...overrides,
  };
}

function device(functionalChannels, type = 'FULL_FLUSH_CONTACT_INTERFACE_6', modelType = 'HmIP-FCI6') {
  return {
    id: 'fci6',
    type,
    label: 'Inputs',
    oem: 'eq-3',
    modelType,
    firmwareVersion: '1.0.0',
    permanentlyReachable: false,
    lastStatusUpdate: 0,
    homeId: 'home1',
    functionalChannels,
  };
}

function createAdapter(initialDevice = device({
    1: channel(1, 'BINARY_BEHAVIOR', 'CLOSED', 'Door'),
    2: channel(2, 'KEY_BEHAVIOR', null, 'Button'),
    3: channel(3, 'SWITCH_BEHAVIOR', 'OPEN', 'Window'),
    4: channel(4, 'BINARY_BEHAVIOR', null, 'Unknown'),
  })) {
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  const staleContact = new ContactSensorService('Stale contact', '5');
  const staleButton = new StatelessProgrammableSwitchService('Stale button', '6');
  const accessory = {
    context: {device: initialDevice},
    displayName: initialDevice.label,
    services: [informationService, staleContact, staleButton],
    UUID: 'uuid-fci6',
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
    api: {
      hap: {
        HAPStatus: {SERVICE_COMMUNICATION_FAILURE: -70402},
        HapStatusError: MockHapStatusError,
      },
      updatePlatformAccessories() {},
    },
    Characteristic,
    config: {},
    groups: {},
    log: {debug() {}, info() {}, warn() {}},
    Service,
  };

  return {
    accessory,
    adapter: new HmIPMultiModeInput(platform, accessory),
    initialDevice,
    staleButton,
    staleContact,
  };
}

test('exposes independently configured HmIP-FCI6 channels', () => {
  const {accessory, adapter, staleButton, staleContact} = createAdapter();
  const contact1 = accessory.getServiceById(ContactSensorService, '1');
  const button2 = accessory.getServiceById(StatelessProgrammableSwitchService, '2');
  const contact3 = accessory.getServiceById(ContactSensorService, '3');
  const contact4 = accessory.getServiceById(ContactSensorService, '4');

  assert.ok(contact1);
  assert.ok(button2);
  assert.ok(contact3);
  assert.ok(contact4);
  assert.ok(!accessory.services.includes(staleContact));
  assert.ok(!accessory.services.includes(staleButton));
  assert.equal(contact1.getCharacteristic(Characteristic.ContactSensorState).getter(),
    Characteristic.ContactSensorState.CONTACT_DETECTED);
  assert.equal(contact3.getCharacteristic(Characteristic.ContactSensorState).getter(),
    Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  assert.throws(
    () => contact4.getCharacteristic(Characteristic.ContactSensorState).getter(),
    error => error instanceof MockHapStatusError && error.status === -70402,
  );

  adapter.channelEvent(2, 'KEY_PRESS_SHORT');
  adapter.channelEvent(2, 'KEY_PRESS_LONG_START');
  adapter.channelEvent(2, 'KEY_PRESS_LONG_STOP');
  assert.deepEqual(
    button2.getCharacteristic(Characteristic.ProgrammableSwitchEvent).events,
    [Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, Characteristic.ProgrammableSwitchEvent.LONG_PRESS],
  );
});

test('hides unassigned inputs on every multi-mode input device', () => {
  const {accessory, adapter} = createAdapter(device({
    1: channel(1, 'BINARY_BEHAVIOR', 'CLOSED', 'Door', {
      actionParameter: 'NOT_CUSTOMISABLE',
      channelRole: 'WINDOW_SENSOR',
      groups: ['group-1'],
    }),
    2: channel(2, 'KEY_BEHAVIOR', 'CLOSED', '', {
      actionParameter: 'NOT_CUSTOMISABLE',
      channelRole: null,
      groups: [],
    }),
  }));

  assert.equal(adapter.hasFunctionalServices, true);
  assert.ok(accessory.getServiceById(ContactSensorService, '1'));
  assert.equal(accessory.getServiceById(StatelessProgrammableSwitchService, '2'), undefined);
});

test('exposes all configured HmIPW-DRI16 inputs using their contact or button mode', () => {
  const channels = Object.fromEntries(Array.from({length: 16}, (_, offset) => {
    const index = offset + 1;
    const configuredContact = index <= 10;
    const configuredButton = index === 11;
    const unusedSecurityAction = index === 12;
    return [index, channel(
      index,
      configuredContact ? 'BINARY_BEHAVIOR' : 'KEY_BEHAVIOR',
      configuredContact ? (index === 10 ? 'OPEN' : 'CLOSED') : null,
      configuredContact || configuredButton ? `Input ${index}` : '',
      configuredContact
        ? {actionParameter: 'NOT_CUSTOMISABLE', channelRole: 'WINDOW_SENSOR', groups: [`group-${index}`]}
        : {
            actionParameter: unusedSecurityAction
              ? 'SECURITY_TOGGLE_INTERNAL_PROTECTION_MODE_SINGLE_ACTION'
              : 'NOT_CUSTOMISABLE',
            channelRole: null,
            groups: [],
          },
    )];
  }));
  const {accessory, adapter} = createAdapter(device(channels, 'WIRED_INPUT_16', 'HmIPW-DRI16'));

  assert.equal(adapter.hasFunctionalServices, true);
  assert.equal(accessory.services.filter(service => service.UUID === ContactSensorService.UUID).length, 10);
  assert.equal(accessory.services.filter(service => service.UUID === StatelessProgrammableSwitchService.UUID).length, 1);
  assert.ok(accessory.getServiceById(StatelessProgrammableSwitchService, '11'));
  assert.equal(accessory.getServiceById(StatelessProgrammableSwitchService, '12'), undefined);
  assert.equal(
    accessory.getServiceById(ContactSensorService, '10')
      .getCharacteristic(Characteristic.ContactSensorState).getter(),
    Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
  );
});

test('updates contact channels independently and reconciles mode changes', () => {
  const {accessory, adapter, initialDevice} = createAdapter();
  const contact1 = accessory.getServiceById(ContactSensorService, '1');
  const contact3 = accessory.getServiceById(ContactSensorService, '3');
  const updatedDevice = device({
    ...initialDevice.functionalChannels,
    1: channel(1, 'BINARY_BEHAVIOR', 'OPEN', 'Door'),
    3: channel(3, 'KEY_BEHAVIOR', null, 'Window'),
  });

  adapter.updateDevice(updatedDevice, {});

  assert.deepEqual(contact1.updates, [[
    Characteristic.ContactSensorState,
    Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
  ]]);
  assert.ok(!accessory.services.includes(contact3));
  assert.ok(accessory.getServiceById(StatelessProgrammableSwitchService, '3'));
});
