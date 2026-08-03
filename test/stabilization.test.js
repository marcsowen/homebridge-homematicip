import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPDeviceFactory} from '../dist/HmIPDeviceFactory.js';
import {HmIPClimateSensor} from '../dist/devices/HmIPClimateSensor.js';
import {HmIPMotionDetector} from '../dist/devices/HmIPMotionDetector.js';

const CurrentHeatingCoolingState = {COOL: 2, HEAT: 1, OFF: 0};
const TargetHeatingCoolingState = {AUTO: 3, COOL: 2, HEAT: 1, OFF: 0};
const TemperatureDisplayUnits = {CELSIUS: 0};
const Characteristic = {
  ContactSensorState: {CONTACT_DETECTED: 0, CONTACT_NOT_DETECTED: 1},
  CurrentAmbientLightLevel: 'CurrentAmbientLightLevel',
  CurrentHeatingCoolingState,
  CurrentRelativeHumidity: 'CurrentRelativeHumidity',
  CurrentTemperature: 'CurrentTemperature',
  FirmwareRevision: 'FirmwareRevision',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  MotionDetected: 'MotionDetected',
  SerialNumber: 'SerialNumber',
  StatusLowBattery: {},
  StatusTampered: {NOT_TAMPERED: 0, TAMPERED: 1},
  TargetHeatingCoolingState,
  TargetTemperature: 'TargetTemperature',
  TemperatureDisplayUnits,
};

class MockCharacteristic {
  constructor() {
    this.value = undefined;
  }

  onGet(handler) {
    this.getter = handler;
    return this;
  }

  onSet(handler) {
    this.setter = handler;
    return this;
  }

  setProps(props) {
    this.props = {...this.props, ...props};
    return this;
  }
}

class MockService {
  constructor(displayName, subtype, UUID) {
    this.displayName = displayName;
    this.subtype = subtype;
    this.UUID = UUID;
    this.characteristics = new Map();
    this.sets = [];
    this.updates = [];
  }

  addOptionalCharacteristic() {
    return this;
  }

  emit() {}

  getCharacteristic(characteristic) {
    let instance = this.characteristics.get(characteristic);
    if (!instance) {
      instance = new MockCharacteristic();
      this.characteristics.set(characteristic, instance);
    }
    return instance;
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

function serviceClass(UUID) {
  return class extends MockService {
    static UUID = UUID;

    constructor(displayName = UUID, subtype) {
      super(displayName, subtype, UUID);
    }
  };
}

const BatteryService = serviceClass('Battery');
const ContactSensorService = serviceClass('ContactSensor');
const HumiditySensorService = serviceClass('HumiditySensor');
const LightSensorService = serviceClass('LightSensor');
const MotionSensorService = serviceClass('MotionSensor');
const TemperatureSensorService = serviceClass('TemperatureSensor');
const ThermostatService = serviceClass('Thermostat');
const Service = {
  AccessoryInformation: 'AccessoryInformation',
  Battery: BatteryService,
  ContactSensor: ContactSensorService,
  HumiditySensor: HumiditySensorService,
  LightSensor: LightSensorService,
  MotionSensor: MotionSensorService,
  TemperatureSensor: TemperatureSensorService,
  Thermostat: ThermostatService,
};

function createAccessory(device, services = []) {
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  return {
    context: {device},
    displayName: device.label,
    services: [informationService, ...services],
    UUID: `uuid-${device.id}`,
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
}

function createPlatform(config = {}) {
  class MockHistoryService {
    addEntry() {}
  }

  return {
    api: {
      updatePlatformAccessories() {},
      user: {storagePath: () => '/tmp'},
    },
    Characteristic,
    config,
    connector: {async command() {}},
    customCharacteristic: {characteristic: {ValvePosition: 'ValvePosition'}},
    FakeGatoHistoryService: MockHistoryService,
    groups: {},
    log: {
      debug() {},
      error() {},
      info() {},
      warn() {},
    },
    Service,
  };
}

function baseDevice(overrides) {
  return {
    id: 'device1',
    type: 'UNKNOWN',
    label: 'Homematic IP name',
    oem: 'eq-3',
    modelType: 'HmIP device',
    firmwareVersion: '1.0.0',
    permanentlyReachable: true,
    lastStatusUpdate: 0,
    homeId: 'home1',
    functionalChannels: {},
    ...overrides,
  };
}

test('factory initializes wall thermostat state after subclass construction', () => {
  const device = baseDevice({
    type: 'WALL_MOUNTED_THERMOSTAT_PRO',
    functionalChannels: {
      1: {
        functionalChannelType: 'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL',
        index: 1,
        groups: [],
        setPointTemperature: 21,
        actualTemperature: 19.5,
        humidity: 57,
      },
    },
  });
  const thermostatService = new ThermostatService('Custom thermostat name');
  const accessory = createAccessory(device, [thermostatService]);
  const platform = createPlatform();
  const adapter = new HmIPDeviceFactory(platform).create(device, accessory);

  assert.ok(adapter);
  assert.equal(
    thermostatService.getCharacteristic(Characteristic.CurrentRelativeHumidity).getter(),
    57,
  );
  assert.equal(thermostatService.displayName, 'Custom thermostat name');
  adapter.dispose();
});

test('motion illumination updates the optional light service', () => {
  const device = baseDevice({
    type: 'MOTION_DETECTOR_INDOOR',
    functionalChannels: {
      1: {
        functionalChannelType: 'MOTION_DETECTION_CHANNEL',
        motionDetected: false,
        illumination: 42,
      },
    },
  });
  const motionService = new MotionSensorService('Motion');
  const lightService = new LightSensorService('Light', 'LightSensor');
  const accessory = createAccessory(device, [motionService, lightService]);
  const platform = createPlatform({devices: {device1: {lightSensor: true}}});
  const adapter = new HmIPMotionDetector(platform, accessory);

  adapter.updateDevice(device, {});

  assert.deepEqual(lightService.updates, [[Characteristic.CurrentAmbientLightLevel, 42]]);
  assert.deepEqual(motionService.updates, []);
});

test('cached sensor service names are not overwritten during construction', () => {
  const device = baseDevice({type: 'TEMPERATURE_HUMIDITY_SENSOR_OUTDOOR'});
  const temperatureService = new TemperatureSensorService('Custom temperature name');
  const humidityService = new HumiditySensorService('Custom humidity name');
  const accessory = createAccessory(device, [temperatureService, humidityService]);

  new HmIPClimateSensor(createPlatform(), accessory);

  assert.equal(temperatureService.displayName, 'Custom temperature name');
  assert.equal(humidityService.displayName, 'Custom humidity name');
  assert.deepEqual(temperatureService.sets, []);
  assert.deepEqual(humidityService.sets, []);
});

test('factory exposes HmIP-FCI1 as a contact sensor', () => {
  const device = baseDevice({
    type: 'FULL_FLUSH_CONTACT_INTERFACE',
    modelType: 'HmIP-FCI1',
    functionalChannels: {
      1: {
        functionalChannelType: 'MULTI_MODE_INPUT_CHANNEL',
        index: 1,
        binaryBehaviorType: 'NORMALLY_CLOSE',
        multiModeInputMode: 'BINARY_BEHAVIOR',
        windowState: 'CLOSED',
      },
    },
  });
  const accessory = createAccessory(device);
  const adapter = new HmIPDeviceFactory(createPlatform()).create(device, accessory);
  const contactService = accessory.getService(ContactSensorService);

  assert.ok(adapter);
  assert.ok(contactService);
  assert.equal(contactService.getCharacteristic(Characteristic.ContactSensorState).getter(),
    Characteristic.ContactSensorState.CONTACT_DETECTED);

  adapter.updateDevice({
    ...device,
    functionalChannels: {
      1: {...device.functionalChannels[1], windowState: 'OPEN'},
    },
  }, {});

  assert.deepEqual(contactService.updates, [[
    Characteristic.ContactSensorState,
    Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
  ]]);
});
