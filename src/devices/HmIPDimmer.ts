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
export class HmIPDimmer extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private brightness = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created dimmer ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.handleOnGet.bind(this))
      .on('set', this.handleOnSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .on('get', this.handleBrightnessGet.bind(this))
      .on('set', this.handleBrightnessSet.bind(this));

    this.updateDevice(accessory.context.device, platform.groups);
  }

  handleOnGet(callback: CharacteristicGetCallback) {
    callback(null, this.brightness > 0);
  }

  async handleOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value && this.brightness === 0) {
      await this.handleBrightnessSet(100, callback);
    } else if (!value) {
      await this.handleBrightnessSet(0, callback);
    } else {
      callback(null);
    }
  }

  handleBrightnessGet(callback: CharacteristicGetCallback) {
    callback(null, this.brightness);
  }

  async handleBrightnessSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting brightness of %s to %s %%', this.accessory.displayName, value);
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      dimLevel: <number>value / 100.0,
    };
    await this.platform.connector.apiCall('device/control/setDimLevel', body);
    callback(null);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
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
          this.platform.log.info('Brightness of %s changed to %s %%', this.accessory.displayName, this.brightness.toFixed(0));
          this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.brightness);
        }
      }
    }
  }

}
