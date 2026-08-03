import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPShading} from '../dist/devices/HmIPShading.js';

const PositionState = {DECREASING: 0, INCREASING: 1, STOPPED: 2};
const Characteristic = {
  CurrentPosition: 'CurrentPosition',
  FirmwareRevision: 'FirmwareRevision',
  HoldPosition: 'HoldPosition',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  PositionState,
  SerialNumber: 'SerialNumber',
  StatusLowBattery: {},
  TargetPosition: 'TargetPosition',
};

class MockCharacteristic {
  onGet(handler) {
    this.getter = handler;
    return this;
  }

  onSet(handler) {
    this.setter = handler;
    return this;
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

class WindowCoveringService extends MockService {
  static UUID = 'WindowCovering';

  constructor(displayName = 'Window covering', subtype) {
    super(displayName, subtype, WindowCoveringService.UUID);
  }
}

const Service = {
  AccessoryInformation: 'AccessoryInformation',
  Battery: class {},
  WindowCovering: WindowCoveringService,
};

function shadingChannel(overrides = {}) {
  return {
    functionalChannelType: 'SHADING_CHANNEL',
    index: 3,
    primaryShadingLevel: 0.25,
    previousPrimaryShadingLevel: null,
    processing: false,
    secondaryShadingLevel: 0,
    secondaryShadingStateType: 'NOT_EXISTENT',
    ...overrides,
  };
}

function createAdapter() {
  const commands = [];
  const device = {
    id: 'hdm1',
    type: 'BLIND_MODULE',
    label: 'Shade',
    oem: 'HunterDouglas',
    modelType: 'HmIP-HDM1',
    firmwareVersion: '1.0.4',
    permanentlyReachable: true,
    lastStatusUpdate: 0,
    homeId: 'home1',
    functionalChannels: {3: shadingChannel()},
  };
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  const coveringService = new WindowCoveringService('Custom shade name');
  const accessory = {
    context: {device},
    displayName: device.label,
    services: [informationService, coveringService],
    UUID: 'uuid-hdm1',
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
    log: {debug() {}, info() {}, warn() {}},
    Service,
  };
  const adapter = new HmIPShading(platform, accessory);
  adapter.updateDevice(device, {});
  return {adapter, commands, coveringService, device};
}

test('controls HmIP-HDM1 through its actual shading channel', async () => {
  const {commands, coveringService} = createAdapter();

  assert.equal(coveringService.displayName, 'Custom shade name');
  assert.equal(coveringService.getCharacteristic(Characteristic.CurrentPosition).getter(), 75);
  assert.equal(coveringService.getCharacteristic(Characteristic.TargetPosition).getter(), 75);

  await coveringService.getCharacteristic(Characteristic.TargetPosition).setter(40);
  await coveringService.getCharacteristic(Characteristic.HoldPosition).setter(false);
  await coveringService.getCharacteristic(Characteristic.HoldPosition).setter(true);

  assert.deepEqual(commands, [
    ['device/control/setPrimaryShadingLevel', {
      channelIndex: 3,
      deviceId: 'hdm1',
      primaryShadingLevel: 0.6,
    }],
    ['device/control/stop', {channelIndex: 3, deviceId: 'hdm1'}],
  ]);
});

test('publishes HmIP-HDM1 position and movement updates', () => {
  const {adapter, coveringService, device} = createAdapter();

  adapter.updateDevice({
    ...device,
    functionalChannels: {
      3: shadingChannel({
        previousPrimaryShadingLevel: 0.25,
        primaryShadingLevel: 0.5,
        processing: true,
      }),
    },
  }, {});

  assert.deepEqual(coveringService.updates.slice(-2), [
    [Characteristic.CurrentPosition, 50],
    [Characteristic.PositionState, PositionState.DECREASING],
  ]);

  adapter.updateDevice({
    ...device,
    functionalChannels: {
      3: shadingChannel({primaryShadingLevel: 0.5, processing: false}),
    },
  }, {});

  assert.deepEqual(coveringService.updates.slice(-2), [
    [Characteristic.TargetPosition, 50],
    [Characteristic.PositionState, PositionState.STOPPED],
  ]);
});
