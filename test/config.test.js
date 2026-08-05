import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {getDeviceConfig} from '../dist/HmIPConfig.js';

const configSchema = JSON.parse(readFileSync(new URL('../config.schema.json', import.meta.url), 'utf8'));

test('enables Homebridge nested arrays without invalidating an empty device list', () => {
  const devicesSchema = configSchema.schema.properties.devices;

  assert.equal(configSchema.fixArrays, true);
  assert.equal(devicesSchema.type, 'array');
  assert.equal(devicesSchema.items.properties.id.required, true);
  assert.equal('required' in devicesSchema.items, false);
});

test('gets a device config from the UI array format', () => {
  const config = getDeviceConfig([
    {id: 'device1', hide: true},
    {id: 'device2', lightSensor: true},
  ], 'device2');

  assert.equal(config?.lightSensor, true);
});

test('gets a device config from the legacy object format', () => {
  const config = getDeviceConfig({
    device1: {hide: true},
  }, 'device1');

  assert.equal(config?.hide, true);
});
