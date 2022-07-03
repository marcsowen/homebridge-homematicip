import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { callbackify } from 'util';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface SwitchChannel {
    functionalChannelType: string;
    on: boolean;
    profileMode: string;
    userDesiredProfileMode: string;
}

interface NotificationLightChannel {
  functionalChannelType: string;
  label: string;
  on: boolean;
  profileMode: string;
  userDesiredProfileMode: string;
  simpleRGBColorState: string;
  index : number;
  dimLevel : number;
}

/**
 * HomematicIP switch with notification light
 *
 * Switches
 *
 * HMIP-BSL (Brand Switch Notification Light)
 *
 */
export class HmIPSwitchNotificationLight extends HmIPGenericDevice implements Updateable {
  private service: Service;
  private upperLed : Service;

  private on = false;
  private brightness = 0;
  private upperLedOn = false;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug(`Created switch ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.upperLed = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);
    this.upperLed.setCharacteristic(this.platform.Characteristic.Name, 'Upper LED');
    
    this.updateDevice(accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.handleOnGet.bind(this))
      .on('set', this.handleOnSet.bind(this));

    this.upperLed.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.handleOnUpperLedGet.bind(this))
      .on('set', this.handleOnUpperLedSet.bind(this));    
    
    this.upperLed.getCharacteristic(this.platform.Characteristic.Brightness)
      .on('get', this.handleBrightnessUpperLedGet.bind(this))
      .on('set', this.handleBrightnessUpperLedSet.bind(this));
  }

  // this callback handles the switch state
  handleOnGet(callback: CharacteristicGetCallback) {
    callback(null, this.on);
  }

  // this callback handles the led state
  handleOnUpperLedGet(callback: CharacteristicGetCallback) {
    this.platform.log.info('Getting lightbulb');
    callback(null, this.brightness > 0);
  }

  handleBrightnessUpperLedGet(callback: CharacteristicGetCallback) {
    callback(null, this.brightness);
  }

  // this callback handles the led state
  async handleOnUpperLedSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value && this.brightness === 0) {
      await this.handleBrightnessUpperLedSet(100, callback);
    } else if (!value) {
      await this.handleBrightnessUpperLedSet(0, callback);
    } else {
      callback(null);
    }
  }

  async handleBrightnessUpperLedSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting brightness of %s to %s %%', this.accessory.displayName, value);
    const body = {
      channelIndex: 2,
      deviceId: this.accessory.context.device.id,
      dimLevel: <number>value / 100.0,
    };
    await this.platform.connector.apiCall('device/control/setDimLevel', body);
    callback(null);
  }
  
  async handleOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting switch %s to %s', this.accessory.displayName, value ? 'ON' : 'OFF');
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
      //this.platform.log.info(`Switch update: ${JSON.stringify(channel)}`);

      if (channel.functionalChannelType === 'SWITCH_CHANNEL') {
        const switchChannel = <SwitchChannel>channel;
        this.platform.log.debug(`Switch update: ${JSON.stringify(channel)}`);

        if (switchChannel.on !== this.on) {
          this.on = switchChannel.on;
          this.platform.log.debug('Switch state of %s changed to %s', this.accessory.displayName, this.on ? 'ON' : 'OFF');
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.on);
        }
      }

      if (channel.functionalChannelType === 'NOTIFICATION_LIGHT_CHANNEL') {
        const notificationLightChannel = <NotificationLightChannel>channel;
        if (notificationLightChannel.index === 2){
          this.platform.log.info(`Notification light update: ${JSON.stringify(channel)}`);

          if (notificationLightChannel.on !== this.upperLedOn) {
            this.upperLedOn = notificationLightChannel.on;
            this.platform.log.info('Notification light state of %s:%s changed to %s', this.accessory.displayName, notificationLightChannel.label, this.upperLedOn ? 'ON' : 'OFF');
            this.upperLed.updateCharacteristic(this.platform.Characteristic.On, this.upperLedOn);
          }

          const brightness = notificationLightChannel.dimLevel * 100.0;
          if (brightness !== null && brightness !== this.brightness) {
            if (this.brightness === 0) {
              this.platform.log.info('Dimmer state %s:%s changed to ON', this.accessory.displayName, notificationLightChannel.label);
              this.upperLed.updateCharacteristic(this.platform.Characteristic.On, true);
            }
  
            if (brightness === 0) {
              this.platform.log.info('Dimmer state %s:%s changed to OFF', this.accessory.displayName, notificationLightChannel.label);
              this.upperLed.updateCharacteristic(this.platform.Characteristic.On, false);
            }
  
            this.brightness = brightness;
            this.platform.log.info('Brightness of %s:%s changed to %s %%', this.accessory.displayName, notificationLightChannel.label, this.brightness.toFixed(0));
            this.upperLed.updateCharacteristic(this.platform.Characteristic.Brightness, this.brightness);
          }

          this.upperLed.setCharacteristic(this.platform.Characteristic.Name, notificationLightChannel.label );
        }
      }
    }
  }
}
