import {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

enum LockState {
  OPEN='OPEN',
  UNLOCKED='UNLOCKED',
  LOCKED='LOCKED'
}

enum MotorState {
  STOPPED='STOPPED',
  CLOSING='CLOSING',
  OPENING='OPENING'
}

interface DoorLockChannel {
  functionalChannelType: string;
  acousticChannelstateDisabled: boolean;
  autoRelockDelay: number;
  autoRelockEnabled: boolean;
  doorHandleType: string;
  doorLockDirection: string;
  doorLockEndStopOffsetLocked: string;
  doorLockEndStopOffsetOpen: string;
  doorLockNeutralPosition: string;
  doorLockTurns: number;
  holdTime: string;
  lockState: LockState;
  motorState: MotorState;
}

/**
 * HomematicIP door lock drive
 *
 * HmIP-DLD
 *
 */
export class HmIPDoorLockDrive extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private lockState: LockState = LockState.UNLOCKED;
  private motorState: MotorState = MotorState.STOPPED;
  private targetLockState = this.platform.Characteristic.LockTargetState.UNSECURED;
  private openLatch = false;
  private pin;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.openLatch = this.accessoryConfig?.['openLatch'] === true;
    this.pin = this.accessoryConfig?.['pin'];

    this.platform.log.debug(`Created door lock drive ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.LockMechanism)
      || this.accessory.addService(this.platform.Service.LockMechanism);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.updateDevice(accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.handleLockCurrentStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onGet(this.handleLockTargetStateGet.bind(this))
      .onSet(this.handleLockTargetStateSet.bind(this));
  }

  handleLockCurrentStateGet() {
    return this.getHmKitLockCurrentState(this.lockState);
  }

  handleLockTargetStateGet() {
    return this.targetLockState;
  }

  async handleLockTargetStateSet(value: CharacteristicValue) {
    this.targetLockState = <number>value;
    this.platform.log.info('Setting door lock drive %s to %s', this.accessory.displayName, this.getLockTargetStateString(value));
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      authorizationPin: this.pin !== undefined ? this.pin : '',
      targetLockState: this.getHmIPTargetLockState(value),
    };
    await this.platform.connector.apiCall('device/control/setLockState', body);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'DOOR_LOCK_CHANNEL') {
        const doorLockChannel = <DoorLockChannel>channel;
        this.platform.log.debug(`Door lock drive update: ${JSON.stringify(channel)}`);

        if (doorLockChannel.lockState !== null && doorLockChannel.lockState !== this.lockState) {
          this.lockState = doorLockChannel.lockState;
          this.platform.log.info('Door lock drive lock state of %s changed to %s', this.accessory.displayName, this.lockState);
          this.updateHmKitLockTargetState();
          this.service.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.getHmKitLockCurrentState(this.lockState));
          this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.targetLockState);
        }

        if (doorLockChannel.motorState !== null && doorLockChannel.motorState !== this.motorState) {
          this.motorState = doorLockChannel.motorState;
          this.platform.log.info('Door lock drive motor state of %s changed to %s', this.accessory.displayName, this.motorState);
          this.updateHmKitLockTargetState();
          this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.targetLockState);
        }
      }
    }
  }

  private getLockTargetStateString(lockTargetState: CharacteristicValue): string {
    switch (lockTargetState) {
      case this.platform.Characteristic.LockTargetState.UNSECURED:
        return 'UNSECURED';
      case this.platform.Characteristic.LockTargetState.SECURED:
        return 'SECURED';
      default:
        return 'UNKNOWN';
    }
  }

  private getHmIPTargetLockState(lockTargetState: CharacteristicValue): string {
    switch (lockTargetState) {
      case this.platform.Characteristic.LockTargetState.UNSECURED:
        if (this.openLatch) {
          return LockState.OPEN;
        } else {
          return LockState.UNLOCKED;
        }
      case this.platform.Characteristic.LockTargetState.SECURED:
        return LockState.LOCKED;
      default:
        return LockState.LOCKED;
    }
  }

  private getHmKitLockCurrentState(lockState: LockState): number {
    switch(lockState) {
      case LockState.LOCKED:
        return this.platform.Characteristic.LockCurrentState.SECURED;
      case LockState.UNLOCKED:
        return this.platform.Characteristic.LockCurrentState.UNSECURED;
      case LockState.OPEN:
        return this.platform.Characteristic.LockCurrentState.UNSECURED;
      default:
        return this.platform.Characteristic.LockCurrentState.UNKNOWN;
    }
  }

  private updateHmKitLockTargetState() {
    switch (this.lockState) {
      case LockState.LOCKED:
        if (this.motorState === MotorState.STOPPED) {
          this.targetLockState = this.platform.Characteristic.LockTargetState.SECURED;
        } else {
          this.targetLockState = this.platform.Characteristic.LockTargetState.UNSECURED;
        }
        break;
      case LockState.UNLOCKED:
        if (this.motorState === MotorState.CLOSING) {
          this.targetLockState = this.platform.Characteristic.LockTargetState.SECURED;
        } else {
          this.targetLockState = this.platform.Characteristic.LockTargetState.UNSECURED;
        }
        break;
      case LockState.OPEN:
        this.targetLockState = this.platform.Characteristic.LockTargetState.UNSECURED;
        break;
    }
  }
}
