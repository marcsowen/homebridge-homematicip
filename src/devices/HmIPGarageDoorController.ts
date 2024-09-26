import {
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    PlatformAccessory,
    Service,
  } from 'homebridge';
  
  import {HmIPPlatform} from '../HmIPPlatform.js';
  import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState.js';
  import {HmIPGenericDevice} from './HmIPGenericDevice.js';
  
  enum DoorState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    VENTILATION_POSITION = 'VENTILATION_POSITION',
    POSITION_UNKNOWN = 'POSITION_UNKNOWN'
  }
  
  interface ImpulseOutputChannel {
    functionalChannelType: string;
    impulseDuration: number;
    processing: boolean;
  }
  
  /**
   * HomematicIP garage door controller
   *
   * HmIP-WGC (Wall Mounted Garage Door Controller)
   *
   */
  export class HmIPGarageDoorController extends HmIPGenericDevice implements Updateable {
    private service: Service;
  
    private currentDoorState: DoorState = DoorState.CLOSED;
    private previousDoorState: DoorState = DoorState.CLOSED;
    private processing = false;
    private targetDoorState: number = this.platform.Characteristic.TargetDoorState.CLOSED;
  
    constructor(
      platform: HmIPPlatform,
      accessory: PlatformAccessory,
    ) {
      super(platform, accessory);
  
      this.platform.log.debug(`Created garage door ${accessory.context.device.label}`);
      this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener)
        || this.accessory.addService(this.platform.Service.GarageDoorOpener);
      this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);
  
      this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
        .on('get', this.handleCurrentDoorStateGet.bind(this));
  
      this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
        .on('get', this.handleTargetDoorStateGet.bind(this))
        .on('set', this.handleTargetDoorStateSet.bind(this));
  
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
        channelIndex: 2,
        deviceId: this.accessory.context.device.id,
      };
      await this.platform.connector.apiCall('device/control/startImpulse', body);
      callback(null);
    }
  
    public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
      super.updateDevice(hmIPDevice, groups);
      for (const id in hmIPDevice.functionalChannels) {
        const channel = hmIPDevice.functionalChannels[id];
        if (channel.functionalChannelType === 'IMPULSE_OUTPUT_CHANNEL') {
          const impulseOutputChannel = <ImpulseOutputChannel>channel;
          this.platform.log.debug(`Garage door update: ${JSON.stringify(channel)}`);
  
          if (this.targetDoorState !== this.getHmKitCurrentDoorState(this.currentDoorState)) {
            this.previousDoorState = this.currentDoorState;
            this.currentDoorState = this.getHmIPCurrentDoorState(this.targetDoorState);
            this.platform.log.info('Garage door state of %s changed to %s', this.accessory.displayName, this.currentDoorState);
            this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState,
              this.getHmKitCurrentDoorState(this.currentDoorState));
          }
  
          if (impulseOutputChannel.processing !== null && impulseOutputChannel.processing !== this.processing) {
            this.processing = impulseOutputChannel.processing;
            this.platform.log.debug('Garage door processing state of %s changed to %s', this.accessory.displayName, this.processing);
            if (!this.processing && this.currentDoorState !== DoorState.OPEN && this.currentDoorState !== DoorState.CLOSED){
              this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState,
                this.platform.Characteristic.CurrentDoorState.STOPPED);
            }
          }
  
          this.updateTargetDoorState();
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
  
    private getHmIPCurrentDoorState(hmKitDoorState: number): DoorState {
      switch (hmKitDoorState) {
        case this.platform.Characteristic.CurrentDoorState.CLOSED:
          return DoorState.CLOSED;
        case this.platform.Characteristic.CurrentDoorState.OPEN:
          return DoorState.OPEN;
        case this.platform.Characteristic.CurrentDoorState.STOPPED:
          return DoorState.VENTILATION_POSITION;
        case this.platform.Characteristic.CurrentDoorState.OPENING:
          return DoorState.POSITION_UNKNOWN;
        case this.platform.Characteristic.CurrentDoorState.CLOSING:
          return DoorState.POSITION_UNKNOWN;
      }
      return DoorState.POSITION_UNKNOWN
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
  