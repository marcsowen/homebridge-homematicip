import type {
  CharacteristicValue,
  Service,
} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface DimmerChannel {
    functionalChannelType: string;
    dimLevel: number;
    profileMode: string;
    userDesiredProfileMode: string;
}

/**
 * HomematicIP dimmer
 *
 * HmIP-PDT Pluggable Dimmer
 * HmIP-BDT Brand Dimmer
 * HmIP-FDT Dimming Actuator flush-mount
 * HmIPW-DRD3 (Homematic IP Wired Dimming Actuator – 3x channels)
 *
 */
export class HmIPDimmer extends HmIPGenericDevice {
  private service: Service;

  private brightness = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created dimmer ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.brightness > 0)
      .onSet(value => this.handleOnSet(value));

    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(() => this.brightness)
      .onSet(value => this.handleBrightnessSet(value));

    this.updateDevice(accessory.context.device, platform.groups);
  }

  private async handleOnSet(value: CharacteristicValue): Promise<void> {
    if (value && this.brightness === 0) {
      await this.handleBrightnessSet(100);
    } else if (!value) {
      await this.handleBrightnessSet(0);
    }
  }

  private async handleBrightnessSet(value: CharacteristicValue): Promise<void> {
    const brightness = Number(value);
    this.platform.log.info('Setting brightness of %s to %s %%', this.accessory.displayName, value);
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      dimLevel: brightness / 100.0,
    };
    await this.platform.connector.command('device/control/setDimLevel', body);
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'DIMMER_CHANNEL') {
        const dimmerChannel = <DimmerChannel>channel;
        this.platform.log.debug(`Dimmer update: ${JSON.stringify(channel)}`);

        const brightness = dimmerChannel.dimLevel * 100.0;
        if (brightness !== null && brightness !== this.brightness) {
          if (this.brightness === 0) {
            this.platform.log.info('Dimmer state %s changed to ON', this.accessory.displayName);
            this.service.updateCharacteristic(this.platform.Characteristic.On, true);
          }

          if (brightness === 0) {
            this.platform.log.info('Dimmer state %s changed to OFF', this.accessory.displayName);
            this.service.updateCharacteristic(this.platform.Characteristic.On, false);
          }

          this.brightness = brightness;
          this.platform.log.debug('Brightness of %s changed to %s %%', this.accessory.displayName, this.brightness.toFixed(0));
          this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.brightness);
        }
      }
    }
  }

}
