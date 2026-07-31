import type {
  CharacteristicValue,
  Service,
} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import {
  type HmIPDevice,
  type HmIPFunctionalChannel,
  type HmIPGroup,
  hasFunctionalChannelType,
  isHmIPRecord,
} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface SwitchChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'SWITCH_CHANNEL' | 'MULTI_MODE_INPUT_SWITCH_CHANNEL';
  label: string | null;
  on: boolean | null;
  index: number;
}

interface SwitchRuntimeChannel {
  functionalChannelType: SwitchChannel['functionalChannelType'];
  label: string;
  on: boolean;
  index: number;
  hapService: Service;
}

function isSwitchChannel(channel: HmIPFunctionalChannel): channel is SwitchChannel {
  if (!hasFunctionalChannelType(channel, 'SWITCH_CHANNEL', 'MULTI_MODE_INPUT_SWITCH_CHANNEL')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && (candidate.label === null || typeof candidate.label === 'string')
    && (candidate.on === null || typeof candidate.on === 'boolean')
    && typeof candidate.index === 'number';
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
export class HmIPSwitch extends HmIPGenericDevice {
  private channels = new Map<number, SwitchRuntimeChannel>();

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created switch ${accessory.context.device.label}`);

    const device = accessory.context.device;
    for (const channel of Object.values(device.functionalChannels)) {
      if (isSwitchChannel(channel) && !this.channels.has(channel.index)) {
        let hapService = this.accessory.getServiceById(this.platform.Service.Switch, channel.index.toString());
        if (!hapService) {
          const label = !channel.label ? accessory.context.device.label : channel.label;
          const service = new this.platform.Service.Switch(label, channel.index.toString());
          hapService = this.accessory.addService(service);
        }
        const runtimeChannel: SwitchRuntimeChannel = {
          ...channel,
          label: channel.label ?? '',
          on: channel.on ?? false,
          hapService,
        };
        hapService.getCharacteristic(this.platform.Characteristic.On)
          .onGet(() => this.handleOnGet(runtimeChannel))
          .onSet(value => this.handleOnSet(runtimeChannel, value));
        this.channels.set(channel.index, runtimeChannel);
        this.platform.log.debug('Added switch channel %d to %s', channel.index, this.accessory.displayName);
      }
    }

    if (this.channels.size === 0) {
      this.platform.log.warn('No functional channels found for device %s', this.accessory.displayName);
    } else {
      this.updateDevice(accessory.context.device, platform.groups);
    }
  }


  /* Determine current switch state */
  private handleOnGet(switchChannel: SwitchRuntimeChannel): boolean {
    return switchChannel.on;
  }


  /* Set new switch state */
  private async handleOnSet(switchChannel: SwitchRuntimeChannel, value: CharacteristicValue): Promise<void> {
    this.platform.log.debug('Setting switch %s channel %d to %s', this.accessory.displayName,
			   switchChannel.index, value ? 'ON' : 'OFF');
    const body = {
      channelIndex: switchChannel.index,
      deviceId: this.accessory.context.device.id,
      on: value,
    };
    await this.platform.connector.command('device/control/setSwitchState', body);
  }


  /* Update device state */
  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (isSwitchChannel(channel) && channel.functionalChannelType === 'SWITCH_CHANNEL') {
        const currentChannel = this.channels.get(channel.index);
        //this.platform.log.debug(`Switch update: ${JSON.stringify(channel)}`);

        if (currentChannel) {

          if (channel.label !== null && channel.label !== '' && channel.label !== currentChannel.label) {
            currentChannel.label = channel.label;
            currentChannel.hapService.displayName = channel.label;
            currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.Name, currentChannel.label);
            this.platform.log.debug('Switch label of %s channel %d changed to %s', this.accessory.displayName,
				   currentChannel.index, currentChannel.label);
          }

          if (channel.on !== null && channel.on !== currentChannel.on) {
            currentChannel.on = channel.on;
            currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.On, currentChannel.on);
            this.platform.log.debug('Switch state of %s channel %d changed to %s', this.accessory.displayName,
				   currentChannel.index, currentChannel.on ? 'ON' : 'OFF');
          }

        }
      }
    }
  }

}
