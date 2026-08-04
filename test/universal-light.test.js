import assert from 'node:assert/strict';
import test from 'node:test';

import {HmIPUniversalLight} from '../dist/devices/HmIPUniversalLight.js';

const Characteristic = {
  Brightness: 'Brightness',
  ColorTemperature: 'ColorTemperature',
  FirmwareRevision: 'FirmwareRevision',
  Hue: 'Hue',
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  On: 'On',
  Saturation: 'Saturation',
  SerialNumber: 'SerialNumber',
  StatusLowBattery: {},
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

  setProps(props) {
    this.props = props;
    return this;
  }
}

class MockService {
  constructor(displayName, subtype, UUID) {
    this.characteristics = new Map();
    this.displayName = displayName;
    this.subtype = subtype;
    this.UUID = UUID;
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

function universalChannel(index, overrides = {}) {
  return {
    channelRole: 'UNIVERSAL_LIGHT_ACTUATOR',
    dimLevel: 0.5,
    functionalChannelType: 'UNIVERSAL_LIGHT_CHANNEL',
    index,
    label: `Output ${index}`,
    on: true,
    supportedOptionalFeatures: {
      IOptionalFeatureColorTemperature: false,
      IOptionalFeatureHueSaturationValue: false,
    },
    ...overrides,
  };
}

function device(functionalChannels) {
  return {
    firmwareVersion: '1.0.0',
    functionalChannels,
    homeId: 'home1',
    id: 'rgbw1',
    label: 'RGBW Controller',
    lastStatusUpdate: 0,
    modelType: 'HmIP-RGBW',
    oem: 'eq-3',
    permanentlyReachable: true,
    type: 'RGBW_DIMMER',
  };
}

function createAdapter() {
  const initialDevice = device({
    1: universalChannel(1, {
      hue: 30,
      saturationLevel: 0.4,
      supportedOptionalFeatures: {IOptionalFeatureHueSaturationValue: true},
    }),
    2: universalChannel(2, {
      colorTemperature: 4000,
      maximumColorTemperature: 6500,
      minimalColorTemperature: 2000,
      supportedOptionalFeatures: {IOptionalFeatureColorTemperature: true},
    }),
    3: universalChannel(3, {channelRole: null, dimLevel: null, on: null}),
  });
  const commands = [];
  const informationService = new MockService('Information', undefined, Service.AccessoryInformation);
  const staleService = new MockLightbulbService('Stale output', '4');
  const accessory = {
    context: {device: initialDevice},
    displayName: initialDevice.label,
    services: [informationService, staleService],
    UUID: 'uuid-rgbw',
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
    connector: {async command(...args) { commands.push(args); }},
    groups: {},
    log: {debug() {}, info() {}, warn() {}},
    Service,
  };

  return {
    accessory,
    adapter: new HmIPUniversalLight(platform, accessory),
    commands,
    initialDevice,
    staleService,
  };
}

test('exposes only configured HmIP-RGBW outputs with their declared capabilities', () => {
  const {accessory, adapter, staleService} = createAdapter();
  const rgb = accessory.getServiceById(MockLightbulbService, '1');
  const tunableWhite = accessory.getServiceById(MockLightbulbService, '2');

  assert.equal(adapter.hasFunctionalServices, true);
  assert.ok(rgb.characteristics.has(Characteristic.Hue));
  assert.ok(rgb.characteristics.has(Characteristic.Saturation));
  assert.ok(!rgb.characteristics.has(Characteristic.ColorTemperature));
  assert.ok(tunableWhite.characteristics.has(Characteristic.ColorTemperature));
  assert.ok(!tunableWhite.characteristics.has(Characteristic.Hue));
  assert.deepEqual(
    tunableWhite.getCharacteristic(Characteristic.ColorTemperature).props,
    {minValue: 154, maxValue: 500},
  );
  assert.equal(accessory.getServiceById(MockLightbulbService, '3'), undefined);
  assert.ok(!accessory.services.includes(staleService));
});

test('uses the universal-light reference commands and actual channel indexes', async () => {
  const {accessory, commands} = createAdapter();
  const rgb = accessory.getServiceById(MockLightbulbService, '1');
  const tunableWhite = accessory.getServiceById(MockLightbulbService, '2');

  await rgb.getCharacteristic(Characteristic.On).setter(false);
  await rgb.getCharacteristic(Characteristic.Brightness).setter(75);
  await rgb.getCharacteristic(Characteristic.Hue).setter(120);
  await rgb.getCharacteristic(Characteristic.Saturation).setter(60);
  await tunableWhite.getCharacteristic(Characteristic.ColorTemperature).setter(250);

  assert.deepEqual(commands, [
    ['device/control/setSwitchState', {channelIndex: 1, deviceId: 'rgbw1', on: false}],
    ['device/control/setDimLevel', {channelIndex: 1, deviceId: 'rgbw1', dimLevel: 0.75}],
    ['device/control/setHueSaturationDimLevel', {
      channelIndex: 1, deviceId: 'rgbw1', hue: 120, saturationLevel: 0.4, dimLevel: 0.75,
    }],
    ['device/control/setHueSaturationDimLevel', {
      channelIndex: 1, deviceId: 'rgbw1', hue: 120, saturationLevel: 0.6, dimLevel: 0.75,
    }],
    ['device/control/setColorTemperatureDimLevel', {
      channelIndex: 2, deviceId: 'rgbw1', colorTemperature: 4000, dimLevel: 0.5,
    }],
  ]);
});

test('publishes HmIP-RGBW state changes to the matching HomeKit output', () => {
  const {accessory, adapter, initialDevice} = createAdapter();
  const rgb = accessory.getServiceById(MockLightbulbService, '1');
  const tunableWhite = accessory.getServiceById(MockLightbulbService, '2');

  adapter.updateDevice(device({
    ...initialDevice.functionalChannels,
    1: universalChannel(1, {
      dimLevel: 0.2,
      hue: 180,
      on: false,
      saturationLevel: 0.7,
      supportedOptionalFeatures: {IOptionalFeatureHueSaturationValue: true},
    }),
    2: universalChannel(2, {
      colorTemperature: 5000,
      supportedOptionalFeatures: {IOptionalFeatureColorTemperature: true},
    }),
  }), {});

  assert.deepEqual(rgb.updates, [
    [Characteristic.On, false],
    [Characteristic.Brightness, 20],
    [Characteristic.Hue, 180],
    [Characteristic.Saturation, 70],
  ]);
  assert.deepEqual(tunableWhite.updates, [[Characteristic.ColorTemperature, 200]]);
});
