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

interface MultiModeInputDimmerChannel {
    functionalChannelType: string;
    on: boolean;
    dimLevel: number;
    profileMode: string;
    userDesiredProfileMode: string;
    index : number;
    label : string;
    hapService: Service;
}

/**
 * HomematicIP multi channel dimmer
 *
 * HmIP-DRDI3 (Homematic IP Dimming Actuator – 3x channels)
 *
 */
export class HmIPDimmerMultiChannel extends HmIPGenericDevice implements Updateable {
  
  private channels = new Map<number, MultiModeInputDimmerChannel>();

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
   super(platform, accessory);
    this.platform.log.debug(`Created dimmer ${accessory.context.device.label}`);

    /* necessary services will be created during updateDevice() */
    this.updateDevice(accessory.context.device, platform.groups);
  }

  handleOnGet(dimmerChannel: MultiModeInputDimmerChannel, callback: CharacteristicGetCallback) {
    this.platform.log.debug('Current dimmer state of %s channel %s is %s', this.accessory.displayName, dimmerChannel.label, dimmerChannel.on ? 'ON' : 'OFF');
    callback(null, dimmerChannel.dimLevel>0);
  }

  async handleOnSet(dimmerChannel: MultiModeInputDimmerChannel, value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting dimmer state %s channel %s to %s', this.accessory.displayName, dimmerChannel.label, value ? 'ON' : 'OFF');
    if (value && dimmerChannel.dimLevel === 0) {
      await this.handleBrightnessSet(dimmerChannel, 100, callback);
    } else if (!value) {
      await this.handleBrightnessSet(dimmerChannel, 0, callback);
    } else {
        callback(null);
    }
  }

  handleBrightnessGet(dimmerChannel: MultiModeInputDimmerChannel, callback: CharacteristicGetCallback) {
    this.platform.log.debug('Current dimmer brightness of %s channel %s is %s', this.accessory.displayName, dimmerChannel.label, dimmerChannel.dimLevel);
    callback(null, dimmerChannel.dimLevel*100);
  }

  async handleBrightnessSet(dimmerChannel: MultiModeInputDimmerChannel, value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting brightness of %s channel %s to %s %%', this.accessory.displayName, dimmerChannel.label, value);
    const body = {
      channelIndex: dimmerChannel.index,
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
       //this.platform.log.info(`Dimmer update: ${JSON.stringify(channel)}`);

       if (channel.functionalChannelType === 'MULTI_MODE_INPUT_DIMMER_CHANNEL') { 
        this.platform.log.debug(`Dimmer update: ${JSON.stringify(channel)}`);
        const dimmerChannel = <MultiModeInputDimmerChannel>channel;

        if (!this.channels.has(dimmerChannel.index)){

          dimmerChannel.hapService = <Service>this.accessory.getServiceById(this.platform.Service.Lightbulb, dimmerChannel.index.toString());
          if (!dimmerChannel.hapService){
            const service = new this.platform.Service.Lightbulb(dimmerChannel.label, dimmerChannel.index.toString());
            service.addCharacteristic(this.platform.Characteristic.ConfiguredName);
            dimmerChannel.hapService = this.accessory.addService(service);
            
            /* The name is set only once when the accessory is added to Homebridge */
            dimmerChannel.hapService.updateCharacteristic(this.platform.Characteristic.ConfiguredName, dimmerChannel.label);
            
            this.platform.log.info('Dimmer %s adding channel %s: %s', this.accessory.displayName, dimmerChannel.index, dimmerChannel.index, dimmerChannel.label);
          }

          dimmerChannel.hapService.getCharacteristic(this.platform.Characteristic.On)
          .on('get', (callback) => {
            this.handleOnGet(dimmerChannel, callback)
          })
          .on('set', (value, callback) => {
              this.handleOnSet(dimmerChannel, value, callback)
          });

          dimmerChannel.hapService.getCharacteristic(this.platform.Characteristic.Brightness)
          .on('get', (callback) => {
            this.handleBrightnessGet(dimmerChannel, callback)
          })
          .on('set', (value, callback) => {
              this.handleBrightnessSet(dimmerChannel, value, callback)
          });         

          this.channels.set(dimmerChannel.index, dimmerChannel);
        }
        else{
          const currentChannel = this.channels.get(dimmerChannel.index);
          if (currentChannel){

            if (currentChannel.on !== dimmerChannel.on){
              currentChannel.on = dimmerChannel.on;
              this.platform.log.debug('Update dimmer state of %s channel %s to %s', this.accessory.displayName, currentChannel.label, dimmerChannel.on ? 'ON' : 'OFF');
              currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.On, currentChannel.on);
            }

            if (currentChannel.dimLevel !== dimmerChannel.dimLevel){
              currentChannel.dimLevel = dimmerChannel.dimLevel;
              this.platform.log.debug('Update dimmer brightness of %s channel %s to %s', this.accessory.displayName, currentChannel.label, dimmerChannel.dimLevel);
              currentChannel.hapService.updateCharacteristic(this.platform.Characteristic.Brightness, currentChannel.dimLevel*100);
            }         
          }
        }
      }
    }
  }
}
