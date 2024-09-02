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

interface NotificationLightSupportedOptionalFeatures {
  IFeatureOpticalSignalBehaviourState: boolean;
}

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
  opticalSignalBehaviour: string;
  index : number;
  dimLevel : number;
  supportedOptionalFeatures: NotificationLightSupportedOptionalFeatures;
}

class NotificationLight {
  index : number;
  label : string;
  simpleColor : string | undefined;
  opticalSignal : string | undefined;
  service : Service | undefined;
  hue : number = 0;
  saturation : number = 0;
  lightness : number = 0;
  brightness : number = 0;
  on : boolean = false;
  hasOpticalSignal: boolean = false;

  constructor(name : string, channel : NotificationLightChannel, lightbulb : Service) {
    this.label = name;
    this.index = channel.index;
    this.service = lightbulb;

    /* Determine optional features of the light */
    if (channel.supportedOptionalFeatures !== undefined) {
      const features = channel.supportedOptionalFeatures;
      if (features !== null && features.IFeatureOpticalSignalBehaviourState !== undefined) {
        this.hasOpticalSignal = features.IFeatureOpticalSignalBehaviourState;
      }
    }
  }
}

/* HmIP color palette based on HSL values */
const HmIPColorPaletteHSL = new Map<string, number[]>([
  ['BLACK', [ 0, 0, 0]], 
  ['BLUE', [240, 100, 50]], 
  ['GREEN', [120, 100, 50]], 
  ['TURQUOISE', [180, 100, 50]], 
  ['RED', [ 0, 100, 50]],
  ['PURPLE', [300, 100, 50]], 
  ['YELLOW', [ 60, 100, 50]],
  ['WHITE', [ 0, 0, 100]], 
]);

const HmIPOpticalSignalAllowedValues = [ 'ON', 'OFF', 'BLINKING_MIDDLE', 'FLASH_MIDDLE', 'BILLOW_MIDDLE' ];

const HmIPTopLightChannelIndex = 2;
const HmIPBottomLightChannelIndex = 3;

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
  private on = false;
  private button1Led : Service | undefined;
  private button2Led : Service | undefined;
  
  private topLight! : NotificationLight;
  private bottomLight! : NotificationLight;

  private simpleSwitch : boolean = false;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    /* Create switch service */
    this.platform.log.debug(`Created switch ${accessory.context.device.label}`);
    this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.handleOnGet.bind(this))
      .on('set', this.handleOnSet.bind(this));

    this.simpleSwitch = this.accessoryConfig?.['simpleSwitch'] === true;

    if (!this.simpleSwitch){

      /* Create service for top light */
      let channel = accessory.context.device.functionalChannels[HmIPTopLightChannelIndex];
      this.button1Led = <Service>this.accessory.getServiceById(this.platform.Service.Lightbulb, 'Button1');
      if (channel.functionalChannelType === 'NOTIFICATION_LIGHT_CHANNEL') {
        if (!this.button1Led) {
          this.button1Led = new this.platform.Service.Lightbulb(channel.label, 'Button1');
          if (this.button1Led) {
            this.button1Led = this.accessory.addService(this.button1Led);
          } else {
            this.platform.log.error('Error adding service to %s for button 1 led', accessory.context.device.label);
          }
        }
        this.topLight = new NotificationLight('Button 1', <NotificationLightChannel>channel, this.button1Led);
        if (this.topLight.hasOpticalSignal) {
          this.platform.log.debug(`Detected opticalSignal feature for ${channel.label}`);
        }
      } else {
        this.platform.log.error('Light for button 1 not available on %s', accessory.context.device.label);
      }

      /* Create service for bottom light */
      channel = accessory.context.device.functionalChannels[HmIPBottomLightChannelIndex];
      this.button2Led = <Service>this.accessory.getServiceById(this.platform.Service.Lightbulb, 'Button2');
      if (channel.functionalChannelType === 'NOTIFICATION_LIGHT_CHANNEL') {
        if (!this.button2Led) {
          this.button2Led = new this.platform.Service.Lightbulb(channel.label, 'Button2');
          if (this.button2Led) {
            this.button2Led = this.accessory.addService(this.button2Led);
          } else {
            this.platform.log.error('Error adding service to %s for button 2 led', accessory.context.device.label);
          }
        } 
        this.bottomLight = new NotificationLight('Button 2', <NotificationLightChannel>channel, this.button2Led);
        if (this.bottomLight.hasOpticalSignal) {
          this.platform.log.debug(`Detected opticalSignal feature for ${channel.label}`);
        }
      } else {
        this.platform.log.error('Light for button 2 not available on %s', accessory.context.device.label);
      }

      /* Bind handlers for top light */
      this.button1Led.getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.handleButton1LedOnGet.bind(this))
        .on('set', this.handleButton1LedOnSet.bind(this));
      
      this.button1Led.getCharacteristic(this.platform.Characteristic.Brightness)
        .on('get', this.handleButton1LedBrightnessGet.bind(this))
        .on('set', this.handleButton1LedBrightnessSet.bind(this));

      this.button1Led.getCharacteristic(this.platform.Characteristic.Hue)
        .on('get', this.handleButton1LedHueGet.bind(this))
        .on('set', this.handleButton1LedHueSet.bind(this));

      this.button1Led.getCharacteristic(this.platform.Characteristic.Saturation)
        .on('get', this.handleButton1LedSaturationGet.bind(this))
        .on('set', this.handleButton1LedSaturationSet.bind(this));

      if (this.topLight.hasOpticalSignal) {
        this.button1Led.addOptionalCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal);
        this.button1Led.getCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal)
          .on('get', this.handleButton1LedOpticalSignalGet.bind(this))
          .on('set', this.handleButton1LedOpticalSignalSet.bind(this));
      }

      /* Bind handlers for bottom light */
      this.button2Led.getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.handleButton2LedOnGet.bind(this))
        .on('set', this.handleButton2LedOnSet.bind(this)); 
      
      this.button2Led.getCharacteristic(this.platform.Characteristic.Brightness)
        .on('get', this.handleButton2LedBrightnessGet.bind(this))
        .on('set', this.handleButton2LedBrightnessSet.bind(this));

      this.button2Led.getCharacteristic(this.platform.Characteristic.Hue)
        .on('get', this.handleButton2LedHueGet.bind(this))
        .on('set', this.handleButton2LedHueSet.bind(this));

      this.button2Led.getCharacteristic(this.platform.Characteristic.Saturation)
        .on('get', this.handleButton2LedSaturationGet.bind(this))
        .on('set', this.handleButton2LedSaturationSet.bind(this));   

      if (this.bottomLight.hasOpticalSignal) {
        this.button2Led.addOptionalCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal);
        this.button2Led.getCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal)
          .on('get', this.handleButton2LedOpticalSignalGet.bind(this))
          .on('set', this.handleButton2LedOpticalSignalSet.bind(this));
      }
    
    } else{

      /* Remove light services if not enabled by config file */
      const topLightService = <Service>this.accessory.getServiceById(this.platform.Service.Lightbulb, 'Button1');
      if (topLightService !== undefined){
        this.accessory.removeService(topLightService);
      }
      const bottomLightService = <Service>this.accessory.getServiceById(this.platform.Service.Lightbulb, 'Button2');
      if (bottomLightService !== undefined){
        this.accessory.removeService(bottomLightService);
      }      
      this.platform.log.info('Removing light services from %s (config=%s)', accessory.context.device.label, this.simpleSwitch);
    }

    this.updateDevice(accessory.context.device, platform.groups);   
  }


  /*
   * Switch handlers
   */
  handleOnGet(callback: CharacteristicGetCallback) {
    this.platform.log.debug('Current switch state of %s is %s', this.accessory.displayName, this.on ? 'ON' : 'OFF');
    callback(null, this.on);
  }

  async handleOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Setting switch %s to %s', this.accessory.displayName, value ? 'ON' : 'OFF');
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      on: value,
    };
    await this.platform.connector.apiCall('device/control/setSwitchState', body);
    callback(null);
  }


  /*
   * Light On characteristic handlers
   */
  buttonLedOnGet(light: NotificationLight): number {
    this.platform.log.debug('Get light state of %s:%s (%s)', this.accessory.displayName, light.label,
      light.on ? 'ON' : 'OFF');
    return (light.on ? 1 : 0);
  }

  handleButton1LedOnGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedOnGet(this.topLight));
  }

  handleButton2LedOnGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedOnGet(this.bottomLight));
  }

  async buttonLedOnSet(light: NotificationLight, value: boolean, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set light state of %s:%s to %s', this.accessory.displayName, light.label,
      value ? 'ON' : 'OFF');
    if (!value) {
      await this.apiSetLight(light.index, undefined, 0, 'BLACK');
      callback(null);
    } else if (light.simpleColor === 'BLACK' || light.opticalSignal === 'OFF') {
      await this.apiSetLight(light.index, 'ON', 100, 'WHITE');
      callback(null);
    } else if (light.brightness == 0) {
      await this.buttonLedBrightnessSet(light, 100, callback);
    } else {
      callback(null);
    }
  }

  async handleButton1LedOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    await this.buttonLedOnSet(this.topLight, <boolean>value, callback);
  }

  async handleButton2LedOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    await this.buttonLedOnSet(this.bottomLight, <boolean>value, callback);
  }


  /*
   * Light Brightness characteristic handlers
   */
  buttonLedBrightnessGet(light: NotificationLight): number {
    this.platform.log.debug('Get light brightness of %s:%s (%d)', this.accessory.displayName, light.label,
      light.brightness);
    return light.brightness;
  }

  handleButton1LedBrightnessGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedBrightnessGet(this.topLight));
  }

  handleButton2LedBrightnessGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedBrightnessGet(this.bottomLight));
  }

  async buttonLedBrightnessSet(light: NotificationLight, value: number, callback: CharacteristicSetCallback) {
    if (light.brightness != value) {
      light.brightness = value;
      await this.apiSetLight(light.index, light.opticalSignal, value, light.simpleColor);
      this.platform.log.debug('Set light brightness of %s:%s to %d %%', this.accessory.displayName,
		light.label, value);
    }
    callback(null);
  }

  async handleButton1LedBrightnessSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    await this.buttonLedBrightnessSet(this.topLight, <number>value, callback);
  }

  async handleButton2LedBrightnessSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    await this.buttonLedBrightnessSet(this.bottomLight, <number>value, callback);
  }


  /*
   * Light Hue characteristic handlers
   */
  buttonLedHueGet(light: NotificationLight): number {
    this.platform.log.debug('Get light hue of %s:%s (%d)', this.accessory.displayName, light.label,
      light.hue);
    return light.hue;
  }

  handleButton1LedHueGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedHueGet(this.topLight));
  }

  handleButton2LedHueGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedHueGet(this.bottomLight));
  }

  async buttonLedColorSet(light: NotificationLight) {
    const color = this.getNearestHmIPColorFromHSL(light.hue, light.saturation, light.lightness);
    if (light.simpleColor != color) {
      light.simpleColor = color;
      this.platform.log.debug('Set light color of %s:%s to %s', this.accessory.displayName,
		light.label, color);
      await this.apiSetLight(light.index, light.opticalSignal, light.brightness, color);
    }
  }

  async handleButton1LedHueSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.topLight.hue != value) {
      this.topLight.hue = <number>value;
      if (this.topLight.hue > 0 || this.topLight.saturation > 0) {
        this.topLight.lightness = 50;
      }
      await this.buttonLedColorSet(this.topLight);
    }
    callback(null);
  }

  async handleButton2LedHueSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.bottomLight.hue != value) {
      this.bottomLight.hue = <number>value;
      if (this.bottomLight.hue > 0 || this.bottomLight.saturation > 0) {
        this.bottomLight.lightness = 50;
      }
      await this.buttonLedColorSet(this.bottomLight);
    }
    callback(null);
  }


  /*
   * Light Saturation characteristic handlers
   */
  buttonLedSaturationGet(light: NotificationLight): number {
    this.platform.log.debug('Get light saturation of %s:%s (%d)', this.accessory.displayName, light.label,
      light.saturation);
    return light.saturation;
  }

  handleButton1LedSaturationGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedSaturationGet(this.topLight));
  }

  handleButton2LedSaturationGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedSaturationGet(this.bottomLight));
  }

  async handleButton1LedSaturationSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.topLight.saturation != value) {
      this.topLight.saturation = <number>value;
      if (this.topLight.hue > 0 || this.topLight.saturation > 0) {
        this.topLight.lightness = 50;
      }
      await this.buttonLedColorSet(this.topLight);
    }
    callback(null);
  }

  async handleButton2LedSaturationSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.bottomLight.saturation != value) {
      this.bottomLight.saturation = <number>value;
      if (this.bottomLight.hue > 0 || this.bottomLight.saturation > 0) {
        this.bottomLight.lightness = 50;
      }
      await this.buttonLedColorSet(this.bottomLight);
    }
    callback(null);
  }


  /*
   * Light OpticalSignal characteristic handlers
   */
  buttonLedOpticalSignalGet(light: NotificationLight): string {
    this.platform.log.debug('Get optical signal of %s:%s (%s)', this.accessory.displayName, light.label,
      light.opticalSignal);
    return <string>light.opticalSignal;
  }

  handleButton1LedOpticalSignalGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedOpticalSignalGet(this.topLight));
  }

  handleButton2LedOpticalSignalGet(callback: CharacteristicGetCallback) {
    callback(null, this.buttonLedOpticalSignalGet(this.bottomLight));
  }

  async buttonLedOpticalSignalSet(light: NotificationLight, value: string, callback: CharacteristicSetCallback) {
    if (HmIPOpticalSignalAllowedValues.includes(value.toUpperCase())) {
      value = value.toUpperCase();
      if (light.opticalSignal != value) {
        light.opticalSignal = value;
        this.platform.log.debug('Set optical signal of %s:%s to %s', this.accessory.displayName,
		light.label, value);
        await this.apiSetLight(light.index, value, light.brightness, light.simpleColor);
      }
    } else {
      this.platform.log.info('Invalid optical signal value of %s:%s to %s', this.accessory.displayName,
		light.label, value);
    }
    callback(null);
  }

  async handleButton1LedOpticalSignalSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    await this.buttonLedOpticalSignalSet(this.topLight, <string>value, callback);
  }

  async handleButton2LedOpticalSignalSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    await this.buttonLedOpticalSignalSet(this.bottomLight, <string>value, callback);
  }


  /*
   * Send light status to phsyical device
   */
  async apiSetLight(index: number, opticalSignal: string | undefined,
		    brightness: number, simpleColor: string | undefined) {
    if (simpleColor === undefined) {
      simpleColor = (brightness == 0 ? 'BLACK' : 'WHITE');
    }
    if (opticalSignal !== undefined) {
      if (opticalSignal == 'OFF' && brightness > 0) {
        opticalSignal = 'ON';
      } else if (opticalSignal != 'OFF' && brightness == 0) {
        opticalSignal = 'OFF';
      }
      const body = {
        channelIndex: index,
        deviceId: this.accessory.context.device.id,
        opticalSignalBehaviour: opticalSignal,
        dimLevel: brightness / 100.0,
        simpleRGBColorState : simpleColor,
      };
      await this.platform.connector.apiCall('device/control/setOpticalSignal', body);
    } else {
      const body = {
        channelIndex: index,
        deviceId: this.accessory.context.device.id,
        dimLevel: brightness / 100.0,
        simpleRGBColorState : simpleColor,
      };
      await this.platform.connector.apiCall('device/control/setSimpleRGBColorDimLevel', body);
    }
  }


  /*
   * Update state of lights
   */
  updateLightState(light : NotificationLight, channel : NotificationLightChannel){
    if (light.service !== undefined) {
      let onstate = null;
      
      if (channel.label !== null && channel.label !== '' && light.label !== channel.label) {
        light.label = channel.label;
        light.service.displayName = light.label;
        light.service.updateCharacteristic(this.platform.Characteristic.Name, light.label);
        this.platform.log.debug('Update light label of %s to %s', this.accessory.displayName, light.label);
      }

      if (channel.dimLevel !== null) {
        const brightness = channel.dimLevel * 100.0;
        if (brightness !== light.brightness) {
          light.brightness = brightness;
          light.service.updateCharacteristic(this.platform.Characteristic.Brightness, light.brightness);
          this.platform.log.debug('Update light brightness of %s:%s to %s %%', this.accessory.displayName,
				light.label, light.brightness.toFixed(0));
        }
        onstate = (channel.dimLevel > 0);
      }

      if (channel.simpleRGBColorState !== null && light.simpleColor !== channel.simpleRGBColorState) {
        const newColor = <string>channel.simpleRGBColorState;
        const hsl = HmIPColorPaletteHSL.get(newColor);            
        if (hsl === undefined) {
          this.platform.log.error('Light color not supported for %s:%s', this.accessory.displayName,
				  light.label);
        } else if (newColor != light.simpleColor) {
          light.simpleColor = newColor;
          if (newColor != 'BLACK') {
            light.hue = hsl[0];
            light.saturation = hsl[1]; 
            light.lightness = hsl[2];
            light.service.updateCharacteristic(this.platform.Characteristic.Hue, light.hue);
            light.service.updateCharacteristic(this.platform.Characteristic.Saturation, light.saturation);
	    if (onstate === null) {
              onstate = true;
            }
          } else {
            onstate = false;
          }
          this.platform.log.debug('Update light color of %s:%s to %s', this.accessory.displayName,
			light.label, newColor);
        }
      }

      if (light.hasOpticalSignal) {
        if (channel.opticalSignalBehaviour !== null && channel.opticalSignalBehaviour !== light.opticalSignal) {
          light.opticalSignal = channel.opticalSignalBehaviour;
          light.service.updateCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal,
					     light.opticalSignal);
	  if (light.opticalSignal == 'OFF') {
            onstate = false;
          } else if (onstate === null) {
            onstate = true;
          }
          this.platform.log.debug('Update optical signal of %s:%s to %s', this.accessory.displayName,
			light.label, light.opticalSignal);
        }
      }

      if (onstate !== null && onstate !== light.on) {
        light.on = onstate;
        light.service.updateCharacteristic(this.platform.Characteristic.On, light.on);
        this.platform.log.debug('Update light state of %s:%s to %s', this.accessory.displayName,
			light.label, light.on ? 'ON' : 'OFF');
      }
    }
  }
  

  /*
   * Update device state - note that there is only one functional channel with
   * type SWITCH_CHANNEL on this device!
   */
  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      //this.platform.log.info(`Switch update: ${JSON.stringify(channel)}`);

      if (channel.functionalChannelType === 'SWITCH_CHANNEL') {
        const switchChannel = <SwitchChannel>channel;
        //this.platform.log.debug(`Switch update: ${JSON.stringify(channel)}`);

        if (switchChannel.on !== null && switchChannel.on !== this.on) {
          this.on = switchChannel.on;
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.on);
          this.platform.log.debug('Switch state of %s changed to %s', this.accessory.displayName,
				 this.on ? 'ON' : 'OFF');
        }
      }

      if (channel.functionalChannelType === 'NOTIFICATION_LIGHT_CHANNEL' && !this.simpleSwitch) {
        const notificationLightChannel = <NotificationLightChannel>channel;
	if (notificationLightChannel.index == this.topLight.index) {
          this.updateLightState(this.topLight, notificationLightChannel);
        } else if (notificationLightChannel.index == this.bottomLight.index) {
          this.updateLightState(this.bottomLight, notificationLightChannel);
        }
      }
    }
  }


  /*
   * Loop over HmIPColorPaletteHSL and find nearest color to a given HSL
   */
  private getNearestHmIPColorFromHSL(h : number, s : number, l : number) {
    let minDistance : number = 360;
    let nearestHmIPColor : string | undefined;
    for (const [key, value] of HmIPColorPaletteHSL) {
      const hsb = value;
      const dh = Math.min(Math.abs(h-hsb[0]), 360-Math.abs(h-hsb[0])) / 180.0;
      const ds = Math.abs(s-hsb[1]) / 100.0;
      const dl = Math.abs(l-hsb[2]) / 100.0;
      const distance = Math.sqrt(dh*dh+ds*ds+dl*dl);
      if (distance <= minDistance){
        minDistance = distance;
        nearestHmIPColor = key;
      }
    }
    this.platform.log.debug('getNearestHmIPColorFromHSL() for h:%s s:%s l:%s is %s with distance %s',
      h, s, l, nearestHmIPColor, minDistance);
    return nearestHmIPColor;
  }
}

