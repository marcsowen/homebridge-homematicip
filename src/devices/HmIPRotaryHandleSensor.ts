import type {CharacteristicValue, Service, WithUUID} from 'homebridge';
import type {HmIPDevice, HmIPGroup} from 'homematicip-cloud-client-ts';
import {connectedGet, connectedSet} from '../HmIPAvailability.js';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

enum WindowState {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  TILTED = 'TILTED'
}

interface RotaryHandleChannel {
  functionalChannelType: string;
  windowState: WindowState;
  eventDelay: number;
}

/**
 * HomematicIP rotary handle sensor
 *
 * HMIP-SRH
 */
export class HmIPRotaryHandleSensor extends HmIPGenericDevice {
  private readonly asContactSensor: boolean;
  private service: Service;

  private windowState = WindowState.CLOSED;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created HmIPRotaryHandleSensor ${accessory.context.device.label}`);
    this.asContactSensor = this.accessoryConfig?.asContactSensor === true;

    if (this.asContactSensor) {
      this.removeService(this.platform.Service.Window);
      this.service = this.getOrAddService(this.platform.Service.ContactSensor, accessory.context.device.label);
      this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
        .onGet(connectedGet(this.platform, () => this.getContactSensorState()));
    } else {
      this.removeService(this.platform.Service.ContactSensor);
      this.service = this.getOrAddService(this.platform.Service.Window, accessory.context.device.label);
      this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
        .onGet(connectedGet(this.platform, () => this.getWindowPosition()));
      this.service.getCharacteristic(this.platform.Characteristic.PositionState)
        .onGet(connectedGet(this.platform, () => this.platform.Characteristic.PositionState.STOPPED));
      this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
        .onGet(connectedGet(this.platform, () => this.getWindowPosition()))
        .onSet(connectedSet(this.platform, value => this.handleWindowTargetPositionSet(value)));
    }

  }

  private removeService(serviceType: WithUUID<typeof Service>): void {
    const service = this.accessory.getService(serviceType);
    if (service) {
      this.accessory.removeService(service);
    }
  }

  private handleWindowTargetPositionSet(value: CharacteristicValue): void {
    this.platform.log.info('Ignoring setting target position for %s to %s', this.accessory.displayName, value);
  }

  private getWindowPosition(): number {
    switch (this.windowState) {
      case WindowState.CLOSED:
        return 0;
      case WindowState.TILTED:
        return 50;
      case WindowState.OPEN:
        return 100;
    }
  }

  private getContactSensorState(): number {
    return this.windowState === WindowState.CLOSED
      ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'ROTARY_HANDLE_CHANNEL') {

        const rotaryHandleChannel = <RotaryHandleChannel>channel;
        this.platform.log.debug('Rotary handle update: %s', JSON.stringify(channel));

        if (rotaryHandleChannel.windowState !== this.windowState) {
          const previousContactSensorState = this.getContactSensorState();
          this.windowState = rotaryHandleChannel.windowState;
          this.platform.log.info('Rotary handle state of %s changed to %s', this.accessory.displayName, this.windowState);
          if (this.asContactSensor) {
            const contactSensorState = this.getContactSensorState();
            if (contactSensorState !== previousContactSensorState) {
              this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, contactSensorState);
            }
          } else {
            this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.getWindowPosition());
            this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.getWindowPosition());
          }
        }
      }
    }
  }
}
