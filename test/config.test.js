import assert from 'node:assert/strict';
import test from 'node:test';
import {getDeviceConfig} from '../dist/HmIPConfig.js';

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
