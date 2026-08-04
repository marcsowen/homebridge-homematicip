import assert from 'node:assert/strict';
import test from 'node:test';
import {redactHmIPDeviceRecord} from '../dist/HmIPDiagnostics.js';

test('redacts device records while preserving implementation-relevant structure and state', () => {
  const redacted = redactHmIPDeviceRecord({
    id: 'device-secret',
    homeId: 'home-secret',
    label: 'Back garden',
    type: 'WATERING_ACTUATOR',
    modelType: 'HmIP-WSM',
    modelId: 586,
    firmwareVersion: '1.0.10',
    permanentlyReachable: true,
    lastStatusUpdate: 1234,
    serializedGlobalTradeItemNumber: 'device-secret',
    functionalChannels: {
      1: {
        deviceId: 'device-secret',
        functionalChannelType: 'WATERING_ACTUATOR_CHANNEL',
        groups: ['group-secret'],
        index: 1,
        label: 'Vegetable beds',
        wateringActive: false,
        waterFlow: 2.5,
        authorized: true,
        authToken: 'must-never-appear',
      },
      2: {
        functionalChannelType: 'MULTI_MODE_INPUT_CHANNEL',
        index: 2,
        label: '',
      },
    },
  });

  assert.equal(redacted.id, '<redacted-id-1>');
  assert.equal(redacted.homeId, '<redacted-id-2>');
  assert.equal(redacted.label, '<redacted>');
  assert.equal(redacted.lastStatusUpdate, '<redacted>');
  assert.equal(redacted.serializedGlobalTradeItemNumber, '<redacted-id-1>');
  assert.equal(redacted.modelId, 586);
  assert.deepEqual(redacted.functionalChannels[1], {
    deviceId: '<redacted-id-1>',
    functionalChannelType: 'WATERING_ACTUATOR_CHANNEL',
    groups: ['<redacted-id-3>'],
    index: 1,
    label: '<redacted>',
    wateringActive: false,
    waterFlow: 2.5,
    authorized: true,
    authToken: '<redacted-secret>',
  });
  assert.equal(redacted.functionalChannels[2].label, '');
  assert.doesNotMatch(JSON.stringify(redacted), /device-secret|home-secret|group-secret|Back garden|Vegetable beds|must-never-appear/);
});
