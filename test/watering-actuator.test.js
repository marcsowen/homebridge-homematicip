import assert from 'node:assert/strict';
import test from 'node:test';
import {HmIPWateringActuator} from '../dist/devices/HmIPWateringActuator.js';
import {getHmIPDeviceKind} from '../dist/HmIPDeviceFactory.js';

const Active = {ACTIVE: 1, INACTIVE: 0};
const InUse = {IN_USE: 1, NOT_IN_USE: 0};
const StatusFault = {GENERAL_FAULT: 1, NO_FAULT: 0};
const ValveType = {IRRIGATION: 1};
const Characteristic = {
  Active,
  FirmwareRevision: 'FirmwareRevision',
  InUse,
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  RemainingDuration: 'RemainingDuration',
  SerialNumber: 'SerialNumber',
  SetDuration: 'SetDuration',
  StatusFault,
  StatusLowBattery: {},
  ValveType,
};

class MockService {
  constructor(displayName, subtype, UUID) {
    this.displayName = displayName;
    this.subtype = subtype;
    this.UUID = UUID;
    this.getters = new Map();
    this.setters = new Map();
    this.sets = [];
    this.updates = [];
  }

  addOptionalCharacteristic() {
    return this;
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

  setCharacteristic(characteristic, value) {
    this.sets.push([characteristic, value]);
    return this;
  }

  updateCharacteristic(characteristic, value) {
    this.updates.push([characteristic, value]);
    return this;
  }
}

class ValveService extends MockService {
  static UUID = 'Valve';

  constructor(displayName = 'Valve', subtype) {
    super(displayName, subtype, ValveService.UUID);
  }
}

const Service = {
  AccessoryInformation: 'AccessoryInformation',
  Battery: 'Battery',
  Valve: ValveService,
};

function createDevice(overrides = {}) {
  return {
    id: 'watering1',
    type: 'WATERING_ACTUATOR',
    label: 'Garden watering',
    oem: 'eq-3',
    modelType: 'HmIP-WSM',
    firmwareVersion: '1.0.10',
    permanentlyReachable: true,
    lastStatusUpdate: 0,
    homeId: 'home1',
    functionalChannels: {
      0: {
        functionalChannelType: 'DEVICE_BASE',
        index: 0,
        lowBat: false,
        unreach: false,
        supportedOptionalFeatures: {IOptionalFeatureLowBat: true},
        deviceOverheated: false,
        deviceUndervoltage: false,
        frostProtectionError: false,
        valveFlowError: false,
        valveWaterError: false,
      },
      1: {
        functionalChannelType: 'WATERING_ACTUATOR_CHANNEL',
        index: 1,
        wateringActive: false,
        wateringOnTime: 3600,
        waterFlow: 0,
        waterVolume: 0,
        waterVolumeSinceOpen: 0,
      },
    },
    ...overrides,
  };
}

function createWateringActuator() {
  const commands = [];
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  const batteryService = new MockService('Battery', undefined, Service.Battery);
  const device = createDevice();
  const accessory = {
    context: {device},
    displayName: device.label,
    services: [informationService, batteryService],
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
  const adapter = new HmIPWateringActuator(platform, accessory);
  const valveService = accessory.getService(ValveService);
  return {accessory, adapter, commands, device, platform, valveService};
}

test('maps watering actuators to a HomeKit irrigation valve', () => {
  assert.equal(getHmIPDeviceKind(createDevice()), 'wateringActuator');
  assert.equal(getHmIPDeviceKind(createDevice({modelType: 'ELV-SH-WSM'})), 'wateringActuator');
  const {adapter, valveService} = createWateringActuator();

  assert.equal(adapter.hasFunctionalServices, true);
  assert.deepEqual(valveService.sets, [[ValveType, ValveType.IRRIGATION]]);
  assert.equal(valveService.getters.get(Active)(), Active.INACTIVE);
  assert.equal(valveService.getters.get(InUse)(), InUse.NOT_IN_USE);
  assert.equal(valveService.getters.get(Characteristic.SetDuration)(), 3600);
  assert.equal(valveService.getters.get(Characteristic.RemainingDuration)(), 0);
});

test('rejects watering actuator records without their valve channel', () => {
  const {accessory, device, platform} = createWateringActuator();
  const invalidAccessory = {
    ...accessory,
    context: {
      device: createDevice({functionalChannels: {0: device.functionalChannels[0]}}),
    },
    services: accessory.services.filter(service => service.UUID !== ValveService.UUID),
  };

  const invalidAdapter = new HmIPWateringActuator(platform, invalidAccessory);

  assert.equal(invalidAdapter.hasFunctionalServices, false);
  assert.equal(invalidAccessory.getService(ValveService), undefined);
});

test('starts timed watering and stops through the reference API commands', async () => {
  const {commands, valveService} = createWateringActuator();

  valveService.setters.get(Characteristic.SetDuration)(600);
  await valveService.setters.get(Active)(Active.ACTIVE);
  await valveService.setters.get(Active)(Active.INACTIVE);

  assert.deepEqual(commands, [
    ['device/control/setWateringSwitchStateWithTime', {
      channelIndex: 1,
      deviceId: 'watering1',
      wateringActive: true,
      wateringTime: 600,
    }],
    ['device/control/setWateringSwitchState', {
      channelIndex: 1,
      deviceId: 'watering1',
      wateringActive: false,
    }],
  ]);
});

test('publishes watering state, duration, and device faults', () => {
  const {adapter, device, valveService} = createWateringActuator();
  adapter.updateDevice({
    ...device,
    functionalChannels: {
      0: {...device.functionalChannels[0], valveWaterError: true},
      1: {...device.functionalChannels[1], wateringActive: true, wateringOnTime: 900},
    },
  }, {});

  assert.ok(valveService.updates.some(update => update[0] === Active && update[1] === Active.ACTIVE));
  assert.ok(valveService.updates.some(update => update[0] === InUse && update[1] === InUse.IN_USE));
  assert.ok(valveService.updates.some(update => update[0] === Characteristic.SetDuration && update[1] === 900));
  assert.ok(valveService.updates.some(update => update[0] === StatusFault && update[1] === StatusFault.GENERAL_FAULT));
  assert.ok(valveService.getters.get(Characteristic.RemainingDuration)() > 0);
});
