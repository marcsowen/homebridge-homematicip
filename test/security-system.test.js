import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPSecuritySystem} from '../dist/HmIPSecuritySystem.js';

const Characteristic = {
  ContactSensorState: {
    CONTACT_DETECTED: 0,
    CONTACT_NOT_DETECTED: 1,
  },
  FirmwareRevision: 'FirmwareRevision',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  SecuritySystemCurrentState: {
    ALARM_TRIGGERED: 4,
    AWAY_ARM: 1,
    DISARMED: 3,
    STAY_ARM: 0,
  },
  SecuritySystemTargetState: {
    AWAY_ARM: 1,
    DISARM: 3,
    NIGHT_ARM: 2,
    STAY_ARM: 0,
  },
  SerialNumber: 'SerialNumber',
};

const Service = {
  AccessoryInformation: 'AccessoryInformation',
  SecuritySystem: 'SecuritySystem',
};

function createSecuritySystem(config = {}) {
  const getters = new Map();
  const setters = new Map();
  const commands = [];
  const informationService = {
    setCharacteristic() {
      return this;
    },
  };
  const securityService = {
    updates: [],
    addOptionalCharacteristic() {
      return this;
    },
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
    context: {
      device: {
        currentAPVersion: '1.0.0',
        functionalHomes: {},
        id: 'home',
      },
    },
    displayName: 'Homematic IP',
    getService(service) {
      return service === Service.AccessoryInformation ? informationService : securityService;
    },
    addService() {
      throw new Error('Security service should already exist');
    },
  };
  const platform = {
    Characteristic,
    Service,
    config,
    connector: {
      async command(...args) {
        commands.push(args);
      },
    },
    log: {
      debug() {},
      info() {},
    },
  };

  return {
    commands,
    getContactState: () => getters.get(Characteristic.ContactSensorState)(),
    getTargetState: () => getters.get(Characteristic.SecuritySystemTargetState)(),
    securityService,
    securitySystem: new HmIPSecuritySystem(platform, accessory),
    setTargetState: setters.get(Characteristic.SecuritySystemTargetState),
  };
}

test('supports the visible security-system toggle and per-device option', () => {
  assert.equal(createSecuritySystem({hideSecuritySystem: true}).securitySystem.hidden, true);
  assert.equal(createSecuritySystem({
    devices: [{id: 'HOME_SECURITY_SYSTEM', hide: true}],
  }).securitySystem.hidden, true);
});

test('uses request-based security zone labels reported by the installation', async () => {
  const {commands, getContactState, getTargetState, securityService, securitySystem, setTargetState}
    = createSecuritySystem();
  securitySystem.updateGroups({
    absence: {id: 'absence', label: 'ABSENCE', type: 'SECURITY_ZONE', windowState: 'OPEN'},
    presence: {active: true, id: 'presence', label: 'PRESENCE', type: 'SECURITY_ZONE', windowState: 'CLOSED'},
  });

  assert.equal(getTargetState(), Characteristic.SecuritySystemTargetState.STAY_ARM);
  assert.equal(getContactState(), Characteristic.ContactSensorState.CONTACT_DETECTED);
  await setTargetState(Characteristic.SecuritySystemTargetState.NIGHT_ARM);

  assert.deepEqual(commands, [[
    'setSecurityZonesActivation',
    {zonesActivation: {ABSENCE: false, PRESENCE: true}},
    {priority: 2},
  ]]);

  securitySystem.updateGroups({
    absence: {id: 'absence', label: 'ABSENCE', type: 'SECURITY_ZONE', windowState: 'CLOSED'},
    presence: {active: true, id: 'presence', label: 'PRESENCE', type: 'SECURITY_ZONE', windowState: 'TILTED'},
  });
  assert.equal(getContactState(), Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  assert.deepEqual(securityService.updates.at(-1), [
    Characteristic.ContactSensorState,
    Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
  ]);
});

test('keeps using classic security zone labels when reported by the installation', async () => {
  const {commands, securitySystem, setTargetState} = createSecuritySystem();
  securitySystem.updateGroups({
    external: {active: false, id: 'external', label: 'EXTERNAL', type: 'SECURITY_ZONE'},
    internal: {active: false, id: 'internal', label: 'INTERNAL', type: 'SECURITY_ZONE'},
  });

  await setTargetState(Characteristic.SecuritySystemTargetState.AWAY_ARM);

  assert.deepEqual(commands, [[
    'setSecurityZonesActivation',
    {zonesActivation: {EXTERNAL: true, INTERNAL: true}},
    {priority: 2},
  ]]);
});

test('clears security zone state when zones disappear from the refreshed snapshot', () => {
  const {securitySystem, getTargetState, getContactState} = createSecuritySystem();
  securitySystem.updateGroups({
    external: {active: true, id: 'external', label: 'EXTERNAL', type: 'SECURITY_ZONE', windowState: 'OPEN'},
    internal: {active: true, id: 'internal', label: 'INTERNAL', type: 'SECURITY_ZONE'},
  });
  assert.equal(getTargetState(), Characteristic.SecuritySystemTargetState.AWAY_ARM);
  securitySystem.updateGroups({});
  assert.equal(getTargetState(), Characteristic.SecuritySystemTargetState.DISARM);
  assert.equal(getContactState(), Characteristic.ContactSensorState.CONTACT_DETECTED);
});
