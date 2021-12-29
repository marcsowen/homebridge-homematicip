import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

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
export class HmIPGarageDoor extends HmIPGenericDevice implements Updateable {
  private service: Service;
  private switchService: Service | undefined;

  private withLightSwitch = true;
  private currentDoorState: DoorState = DoorState.CLOSED;
  private previousDoorState: DoorState = DoorState.CLOSED;
  private processing = false;
  private on = false;
  private targetDoorState: number = this.platform.Characteristic.TargetDoorState.CLOSED;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.withLightSwitch = this.accessoryConfig?.['lightSwitch'] === true;

    this.platform.log.debug(`Created garage door ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener)
      || this.accessory.addService(this.platform.Service.GarageDoorOpener);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .on('get', this.handleCurrentDoorStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .on('get', this.handleTargetDoorStateGet.bind(this))
      .on('set', this.handleTargetDoorStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .on('get', this.handleObstructionDetectedGet.bind(this));

    if (this.withLightSwitch) {
      this.switchService = this.accessory.getService(this.platform.Service.Switch)
        || this.accessory.addService(this.platform.Service.Switch);

      this.switchService.getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.handleOnGet.bind(this))
        .on('set', this.handleOnSet.bind(this));
    } else {
      const switchService = this.accessory.getService(this.platform.Service.Switch);
      if (switchService !== undefined) {
        this.platform.log.info('Removing light service from %s', accessory.context.device.label);
        this.accessory.removeService(switchService);
      }
    }

    this.updateDevice(accessory.context.device, platform.groups);
  }

  handleCurrentDoorStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.getHmKitCurrentDoorState(this.currentDoorState));
  }

  handleTargetDoorStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.targetDoorState);
  }

  async handleTargetDoorStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.targetDoorState = <number>value;
    this.platform.log.info('Setting garage door %s to %s', this.accessory.displayName,
      value === this.platform.Characteristic.TargetDoorState.OPEN ? 'OPEN' : 'CLOSED');
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      doorCommand: value === this.platform.Characteristic.TargetDoorState.OPEN ? DoorCommand.OPEN : DoorCommand.CLOSE,
    };
    await this.platform.connector.apiCall('device/control/sendDoorCommand', body);
    callback(null);
  }

  handleObstructionDetectedGet(callback: CharacteristicGetCallback) {
    callback(null, false);
  }

  handleOnGet(callback: CharacteristicGetCallback) {
    callback(null, this.on);
  }

  async handleOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting light of garage door %s to %s', this.accessory.displayName, value ? 'ON' : 'OFF');
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      on: value,
    };
    await this.platform.connector.apiCall('device/control/setSwitchState', body);
    callback(null);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
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
          this.platform.log.info('Garage door processing state of %s changed to %s', this.accessory.displayName, this.processing);
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
