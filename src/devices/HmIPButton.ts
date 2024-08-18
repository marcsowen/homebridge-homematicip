import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform.js';
import {HmIPDevice, HmIPGroup, EventUpdateable} from '../HmIPState.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface ButtonChannel {
  functionalChannelType: string;
  label : string;
  index : number;
  hapService: Service;
}


/**
 * HomematicIP button accessory
 *
 * Buttons
 *
 * HMIP-WRC2 (Homematic IP button - 2 channels)
 * HMIP-WRC6 (Homematic IP button - 6 channels)
 * HMIP-BRC2 (Homematic IP brand button - 2 channels)
 * HMIP-WRCC2 (Homematic IP flat button - 2 channels)
 *
 */
export class HmIPButton extends HmIPGenericDevice implements EventUpdateable {
  private channels = new Map<number, ButtonChannel>();

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created button ${accessory.context.device.label}`);

    for (const id in accessory.context.device.functionalChannels) {
      const channel = accessory.context.device.functionalChannels[id];
      if (channel.functionalChannelType === 'SINGLE_KEY_CHANNEL') {
        const buttonChannel = <ButtonChannel>channel;

        if (!this.channels.has(buttonChannel.index)) {
          buttonChannel.hapService = <Service>this.accessory.getServiceById(
		  this.platform.Service.StatelessProgrammableSwitch, buttonChannel.index.toString());
          if (!buttonChannel.hapService) {
            const label = (buttonChannel.label == null || buttonChannel.label == '')
				? `Button ${buttonChannel.index}`
				: buttonChannel.label;
            const service = new this.platform.Service.StatelessProgrammableSwitch(label,
				buttonChannel.index.toString());
            buttonChannel.hapService = this.accessory.addService(service);
          }
          buttonChannel.hapService.updateCharacteristic(this.platform.Characteristic.ServiceLabelIndex,
				buttonChannel.index);
          this.channels.set(buttonChannel.index, buttonChannel);
          this.platform.log.debug('Added button channel %d to %s', buttonChannel.index, this.accessory.displayName);
        }
      }
    }

    if (this.channels.size == 0) {
      this.platform.log.warn('No functional channels found for device %s', this.accessory.displayName);
    } else {
      this.updateDevice(accessory.context.device, platform.groups);
    }
  }


  /* Update device state */
  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'SINGLE_KEY_CHANNEL') {
        const buttonChannel = <ButtonChannel>channel;
        const currentChannel = this.channels.get(buttonChannel.index);
        // this.platform.log.info(`Button update: ${JSON.stringify(channel)}`);

	if (currentChannel) {

          if (buttonChannel.label !== null && buttonChannel.label != '' &&
              buttonChannel.label != currentChannel.label) {
            currentChannel.label = buttonChannel.label;
	    currentChannel.hapService.displayName = buttonChannel.label;
            currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.Name, currentChannel.label);
            this.platform.log.debug('Button label of %s channel %d changed to %s', this.accessory.displayName,
				   currentChannel.index, currentChannel.label);
          }

        }
      }
    }
  }


  /* Device channel event */
  public channelEvent(channelId: number, channelEventType: string) {
    const currentChannel = this.channels.get(channelId);
    if (currentChannel) {
      this.platform.log.debug(`Button event: ${currentChannel.index}: ${channelEventType}`);
      if (channelEventType === 'KEY_PRESS_SHORT') {
        currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent,
				this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
      } else if (channelEventType === 'KEY_PRESS_LONG_STOP') {
        currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent,
				this.platform.Characteristic.ProgrammableSwitchEvent.LONG_PRESS);
      }
    }
  }

}
