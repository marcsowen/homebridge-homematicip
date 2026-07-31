import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPSecuritySystem} from '../dist/HmIPSecuritySystem.js';

const Characteristic = {
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

function createSecuritySystem() {
  const getters = new Map();
  const setters = new Map();
  const commands = [];
  const informationService = {
    setCharacteristic() {
      return this;
    },
  };
  const securityService = {
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
    updateCharacteristic() {},
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
    config: {},
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
    getTargetState: () => getters.get(Characteristic.SecuritySystemTargetState)(),
    securitySystem: new HmIPSecuritySystem(platform, accessory),
    setTargetState: setters.get(Characteristic.SecuritySystemTargetState),
  };
}

test('uses request-based security zone labels reported by the installation', async () => {
  const {commands, getTargetState, securitySystem, setTargetState} = createSecuritySystem();
  securitySystem.updateGroups({
    absence: {active: false, id: 'absence', label: 'ABSENCE', type: 'SECURITY_ZONE'},
    presence: {active: true, id: 'presence', label: 'PRESENCE', type: 'SECURITY_ZONE'},
  });

  assert.equal(getTargetState(), Characteristic.SecuritySystemTargetState.STAY_ARM);
  await setTargetState(Characteristic.SecuritySystemTargetState.NIGHT_ARM);

  assert.deepEqual(commands, [[
    'home/security/setZonesActivation',
    {zonesActivation: {ABSENCE: false, PRESENCE: true}},
    2,
  ]]);
});

test('keeps using classic security zone labels when reported by the installation', async () => {
  const {commands, securitySystem, setTargetState} = createSecuritySystem();
  securitySystem.updateGroups({
    external: {active: false, id: 'external', label: 'EXTERNAL', type: 'SECURITY_ZONE'},
    internal: {active: false, id: 'internal', label: 'INTERNAL', type: 'SECURITY_ZONE'},
  });

  await setTargetState(Characteristic.SecuritySystemTargetState.AWAY_ARM);

  assert.deepEqual(commands, [[
    'home/security/setZonesActivation',
    {zonesActivation: {EXTERNAL: true, INTERNAL: true}},
    2,
  ]]);
});
