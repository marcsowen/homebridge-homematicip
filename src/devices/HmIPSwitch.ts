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

interface SwitchChannel {
  functionalChannelType: string;
  label : string;
  on: boolean;
  profileMode: string;
  userDesiredProfileMode: string;
  index : number;
  hapService: Service;
}


/**
 * HomematicIP switch
 *
 * Switches
 *
 * HMIP-PS (Pluggable Switch)
 * HMIP-FSI16 (Full Flush Input Switch)
 * HMIP-BS2 (Brand Switch - 2x channels)
 * HMIP-PCBS (Switch Circuit Board - 1 channel)
 * HMIP-PCBS-BAT (Printed Circuit Board Switch Battery)
 * HMIP-PCBS2 (Switch Circuit Board - 2x channels)
 * HMIP-MOD-OC8 ( Open Collector Module )
 * HMIP-WHS2 (Switch Actuator for heating systems – 2x channels)
 * HMIPW-DRS8 (Homematic IP Wired Switch Actuator – 8x channels)
 * HMIPW-DRS4 (Homematic IP Wired Switch Actuator – 4x channels)
 * HMIP-DRSI4 (Homematic IP Switch Actuator for DIN rail mount – 4x channels)
 *
 */
export class HmIPSwitch extends HmIPGenericDevice implements Updateable {
  private channels = new Map<number, SwitchChannel>();

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created switch ${accessory.context.device.label}`);

    for (const id in accessory.context.device.functionalChannels) {
      const channel = accessory.context.device.functionalChannels[id];
      if (channel.functionalChannelType === 'SWITCH_CHANNEL' ||
          channel.functionalChannelType === 'MULTI_MODE_INPUT_SWITCH_CHANNEL') {
        const switchChannel = <SwitchChannel>channel;

        if (!this.channels.has(switchChannel.index)) {
          switchChannel.hapService = <Service>this.accessory.getServiceById(this.platform.Service.Switch,
									    switchChannel.index.toString());
          if (!switchChannel.hapService) {
            const label = (switchChannel.label == null || switchChannel.label == '')
				? accessory.context.device.label
				: switchChannel.label;
            const service = new this.platform.Service.Switch(label, switchChannel.index.toString());
            switchChannel.hapService = this.accessory.addService(service);
          }
          switchChannel.hapService.getCharacteristic(this.platform.Characteristic.On)
            .on('get', (callback) => {
              this.handleOnGet(switchChannel, callback)
            })
            .on('set', (value, callback) => {
              this.handleOnSet(switchChannel, value, callback)
            });
          this.channels.set(switchChannel.index, switchChannel);
          this.platform.log.info('Added switch channel %d to %s', switchChannel.index, this.accessory.displayName);
        }
      }
    }

    if (this.channels.size == 0) {
      this.platform.log.warn('No functional channels found for device %s', this.accessory.displayName);
    } else {
      this.updateDevice(accessory.context.device, platform.groups);
    }
  }


  /* Determine current switch state */
  handleOnGet(switchChannel: SwitchChannel, callback: CharacteristicGetCallback) {
    callback(null, switchChannel.on);
  }


  /* Set new switch state */
  async handleOnSet(switchChannel: SwitchChannel, value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting switch %s channel %d to %s', this.accessory.displayName,
			   switchChannel.index, value ? 'ON' : 'OFF');
    const body = {
      channelIndex: switchChannel.index,
      deviceId: this.accessory.context.device.id,
      on: value,
    };
    await this.platform.connector.apiCall('device/control/setSwitchState', body);
    callback(null);
  }


  /* Update device state */
  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'SWITCH_CHANNEL') {
        const switchChannel = <SwitchChannel>channel;
        const currentChannel = this.channels.get(switchChannel.index);
        //this.platform.log.debug(`Switch update: ${JSON.stringify(channel)}`);

	if (currentChannel) {

          if (switchChannel.label != '' && switchChannel.label != currentChannel.label) {
            currentChannel.label = switchChannel.label;
	    currentChannel.hapService.displayName = switchChannel.label;
            currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.Name, switchChannel.label);
            this.platform.log.debug('Switch label of %s channel %d changed to %s', this.accessory.displayName,
				   currentChannel.index, switchChannel.label);
          }

          if (switchChannel.on !== currentChannel.on) {
            currentChannel.on = switchChannel.on;
            currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.On, switchChannel.on);
            this.platform.log.debug('Switch state of %s channel %d changed to %s', this.accessory.displayName,
				   currentChannel.index, switchChannel.on ? 'ON' : 'OFF');
          }

        }
      }
    }
  }

}
