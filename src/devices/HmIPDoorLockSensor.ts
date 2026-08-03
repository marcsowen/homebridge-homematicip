import type {
  Service,
} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

enum LockState {
  UNKNOWN='UNKNOWN',
  UNLOCKED='UNLOCKED',
  LOCKED='LOCKED'
}

interface DoorLockSensorChannel {
  functionalChannelType: string;
  doorLockDirection: string;
  doorLockNeutralPosition: string;
  doorLockTurns: number;
  lockState: LockState;
}

/**
 * HomematicIP door lock sensor
 *
 * HmIP-DLS
 *
 */
export class HmIPDoorLockSensor extends HmIPGenericDevice {
  private service: Service;

  private lockState: LockState = LockState.UNKNOWN;
  private targetLockState = this.platform.Characteristic.LockTargetState.UNSECURED;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created door lock sensor ${accessory.context.device.label}`);
    this.service = this.getOrAddService(this.platform.Service.LockMechanism, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.handleLockCurrentStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onGet(this.handleLockTargetStateGet.bind(this));
  }

  handleLockCurrentStateGet() {
    return this.getHmKitLockCurrentState(this.lockState);
  }

  handleLockTargetStateGet() {
    return this.targetLockState;
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'DOOR_LOCK_SENSOR_CHANNEL') {
        const doorLockSensorChannel = <DoorLockSensorChannel>channel;
        this.platform.log.debug(`Door lock sensor update: ${JSON.stringify(channel)}`);

        if (doorLockSensorChannel.lockState !== null && doorLockSensorChannel.lockState !== this.lockState) {
          this.lockState = doorLockSensorChannel.lockState;
          this.platform.log.info('Door lock sensor lock state of %s changed to %s', this.accessory.displayName, this.lockState);
          this.updateHmKitLockTargetState();
          this.service.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.getHmKitLockCurrentState(this.lockState));
          this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.targetLockState);
        }
      }
    }
  }

  private getHmKitLockCurrentState(lockState: LockState): number {
    switch(lockState) {
      case LockState.LOCKED:
        return this.platform.Characteristic.LockCurrentState.SECURED;
      case LockState.UNLOCKED:
        return this.platform.Characteristic.LockCurrentState.UNSECURED;
      case LockState.UNKNOWN:
        return this.platform.Characteristic.LockCurrentState.UNKNOWN;
      default:
        return this.platform.Characteristic.LockCurrentState.UNKNOWN;
    }
  }

  private updateHmKitLockTargetState() {
    switch (this.lockState) {
      case LockState.LOCKED:
          this.targetLockState = this.platform.Characteristic.LockTargetState.SECURED;
        break;
      case LockState.UNLOCKED:
          this.targetLockState = this.platform.Characteristic.LockTargetState.UNSECURED;
        break;
      case LockState.UNKNOWN:
        this.targetLockState = this.platform.Characteristic.LockTargetState.UNSECURED;
        break;
    }
  }
}
