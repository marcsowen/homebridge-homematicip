import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {getDeviceConfig, hasLegacyDeviceConfig} from '../dist/HmIPConfig.js';

const configSchema = JSON.parse(readFileSync(new URL('../config.schema.json', import.meta.url), 'utf8'));

test('identifies the access point identifier as its SGTIN', () => {
  const accessPointSchema = configSchema.schema.properties.access_point;

  assert.match(accessPointSchema.title, /SGTIN/);
  assert.match(accessPointSchema.description, /SGTIN/);
});

test('renders an initially empty per-device array as an addable tab list', () => {
  const devicesSchema = configSchema.schema.properties.devices;

  assert.equal(configSchema.fixArrays, true);
  assert.equal(devicesSchema.type, 'array');
  assert.deepEqual(devicesSchema.items.required, ['id']);
  assert.equal(devicesSchema.items.properties.id.minLength, 1);
  assert.equal(devicesSchema.items.additionalProperties, false);
  assert.equal(devicesSchema['x-schema-form'].type, 'tabarray');
  assert.equal(devicesSchema['x-schema-form'].listItems, 0);
  assert.deepEqual(configSchema.layout, ['*']);
});

test('gets a device config from the supported array format', () => {
  const config = getDeviceConfig([
    {id: 'device1', hide: true},
    {id: 'device2', lightSensor: true},
  ], 'device2');

  assert.equal(config?.lightSensor, true);
  assert.equal('id' in config, false);
});

test('detects legacy object-based per-device configuration', () => {
  assert.equal(hasLegacyDeviceConfig(undefined), false);
  assert.equal(hasLegacyDeviceConfig([]), false);
  assert.equal(hasLegacyDeviceConfig({}), true);
  assert.equal(hasLegacyDeviceConfig({device1: {hide: true}}), true);
});
