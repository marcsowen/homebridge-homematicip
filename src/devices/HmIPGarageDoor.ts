import type {
  CharacteristicValue,
  Service,
} from 'homebridge';
import type {HmIPDevice, HmIPGroup} from 'homematicip-cloud-client-ts';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

enum DoorState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    VENTILATION_POSITION = 'VENTILATION_POSITION',
    POSITION_UNKNOWN = 'POSITION_UNKNOWN'
}

enum DoorCommand {
    OPEN = 'OPEN',
    STOP = 'STOP',
    CLOSE = 'CLOSE',
    PARTIAL_OPEN = 'PARTIAL_OPEN'
}

interface DoorChannel {
    functionalChannelType: string;
    doorState: DoorState;
    on: boolean;
    processing: boolean;
    ventilationPositionSupported: boolean;
}

/**
 * HomematicIP garage door
 *
 * HmIP-MOD-TM (Garage Door Module Tormatic)
 * HmIP-MOD-HO (Garage Door Module for Hörmann)
 *
 */
export class HmIPGarageDoor extends HmIPGenericDevice {
  private service: Service;
  private switchService: Service | undefined;

  private currentDoorState: DoorState = DoorState.CLOSED;
  private previousDoorState: DoorState = DoorState.CLOSED;
  private processing = false;
  private on = false;
  private targetDoorState: number = this.platform.Characteristic.TargetDoorState.CLOSED;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created garage door ${accessory.context.device.label}`);
    this.service = this.getOrAddService(this.platform.Service.GarageDoorOpener, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .onGet(() => this.getHmKitCurrentDoorState(this.currentDoorState));

    this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .onGet(() => this.targetDoorState)
      .onSet(value => this.handleTargetDoorStateSet(value));

    this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .onGet(() => false);

    const withLightSwitch = this.accessoryConfig?.lightSwitch === true;

    if (withLightSwitch) {
      this.switchService = this.getOrAddService(
        this.platform.Service.Switch,
        `${accessory.context.device.label} Light`,
      );

      this.switchService.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.on)
        .onSet(value => this.handleOnSet(value));
    } else {
      const switchService = this.accessory.getService(this.platform.Service.Switch);
      if (switchService !== undefined) {
        this.platform.log.info('Removing light service from %s', accessory.context.device.label);
        this.accessory.removeService(switchService);
      }
    }

  }

  private async handleTargetDoorStateSet(value: CharacteristicValue): Promise<void> {
    this.targetDoorState = Number(value);
    this.platform.log.info('Setting garage door %s to %s', this.accessory.displayName,
      value === this.platform.Characteristic.TargetDoorState.OPEN ? 'OPEN' : 'CLOSED');
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      doorCommand: value === this.platform.Characteristic.TargetDoorState.OPEN ? DoorCommand.OPEN : DoorCommand.CLOSE,
    };
    await this.platform.connector.command('device/control/sendDoorCommand', body);
  }

  private async handleOnSet(value: CharacteristicValue): Promise<void> {
    this.platform.log.info('Setting light of garage door %s to %s', this.accessory.displayName, value ? 'ON' : 'OFF');
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      on: value,
    };
    await this.platform.connector.command('device/control/setSwitchState', body);
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'DOOR_CHANNEL') {
        const doorChannel = <DoorChannel>channel;
        this.platform.log.debug(`Garage door update: ${JSON.stringify(channel)}`);

        if (doorChannel.doorState !== null && doorChannel.doorState !== this.currentDoorState) {
          this.previousDoorState = this.currentDoorState;
          this.currentDoorState = doorChannel.doorState;
          this.platform.log.info('Garage door state of %s changed to %s', this.accessory.displayName, this.currentDoorState);
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState,
            this.getHmKitCurrentDoorState(this.currentDoorState));
        }

        if (doorChannel.processing !== null && doorChannel.processing !== this.processing) {
          this.processing = doorChannel.processing;
          this.platform.log.debug('Garage door processing state of %s changed to %s', this.accessory.displayName, this.processing);
          if (!this.processing && this.currentDoorState !== DoorState.OPEN && this.currentDoorState !== DoorState.CLOSED){
            this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState,
              this.platform.Characteristic.CurrentDoorState.STOPPED);
          }
        }

        this.updateTargetDoorState();

        if (doorChannel.on !== null && doorChannel.on !== this.on) {
          this.on = doorChannel.on;
          this.platform.log.info('Garage door light of %s changed to %s', this.accessory.displayName, this.on ? 'ON' : 'OFF');
          this.switchService?.updateCharacteristic(this.platform.Characteristic.On, this.on);
        }
      }
    }
  }

  private getHmKitCurrentDoorState(hmIPDoorState: DoorState): number {
    switch (hmIPDoorState) {
      case DoorState.CLOSED:
        return this.platform.Characteristic.CurrentDoorState.CLOSED;
      case DoorState.OPEN:
        return this.platform.Characteristic.CurrentDoorState.OPEN;
      case DoorState.VENTILATION_POSITION:
        return this.platform.Characteristic.CurrentDoorState.STOPPED;
      case DoorState.POSITION_UNKNOWN:
        if (this.previousDoorState === DoorState.CLOSED) {
          return this.platform.Characteristic.CurrentDoorState.OPENING;
        } else {
          return this.platform.Characteristic.CurrentDoorState.CLOSING;
        }
    }
  }

  private updateTargetDoorState() {
    let newTargetDoorState: number;

    if (this.processing) {
      if (this.previousDoorState === DoorState.CLOSED) {
        newTargetDoorState = this.platform.Characteristic.TargetDoorState.OPEN;
      } else {
        newTargetDoorState = this.platform.Characteristic.TargetDoorState.CLOSED;
      }
    } else {
      if (this.currentDoorState === DoorState.CLOSED) {
        newTargetDoorState = this.platform.Characteristic.TargetDoorState.CLOSED;
      } else {
        newTargetDoorState = this.platform.Characteristic.TargetDoorState.OPEN;
      }
    }

    if (newTargetDoorState !== this.targetDoorState) {
      this.targetDoorState = newTargetDoorState;
      this.platform.log.info('Garage door target door state of %s logically changed to %s',
        this.accessory.displayName, this.targetDoorState);
      this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, this.targetDoorState);
    }
  }

}
