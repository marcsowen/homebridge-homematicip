import type {
  CharacteristicValue,
  Service,
} from 'homebridge';
import type {HmIPDevice, HmIPGroup} from 'homematicip-cloud-client-ts';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
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
const HmIPColorPaletteHSL = new Map<string, readonly [number, number, number]>([
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
export class HmIPSwitchNotificationLight extends HmIPGenericDevice {
  private service: Service;
  private on = false;
  private button1Led : Service | undefined;
  private button2Led : Service | undefined;
  
  private topLight! : NotificationLight;
  private bottomLight! : NotificationLight;

  private simpleSwitch : boolean = false;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    /* Create switch service */
    this.platform.log.debug(`Created switch ${accessory.context.device.label}`);
    this.service = this.getOrAddService(this.platform.Service.Switch, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.on)
      .onSet(value => this.handleOnSet(value));

    this.simpleSwitch = this.accessoryConfig?.simpleSwitch === true;

    if (!this.simpleSwitch){

      /* Create service for top light */
      let channel = accessory.context.device.functionalChannels[HmIPTopLightChannelIndex];
      this.button1Led = <Service>this.accessory.getServiceById(this.platform.Service.Lightbulb, 'Button1');
      if (channel?.functionalChannelType === 'NOTIFICATION_LIGHT_CHANNEL') {
        const notificationChannel = channel as NotificationLightChannel;
        if (!this.button1Led) {
          this.button1Led = new this.platform.Service.Lightbulb(notificationChannel.label, 'Button1');
          if (this.button1Led) {
            this.button1Led = this.accessory.addService(this.button1Led);
          } else {
            this.platform.log.error('Error adding service to %s for button 1 led', accessory.context.device.label);
          }
        }
        this.topLight = new NotificationLight('Button 1', notificationChannel, this.button1Led);
        if (this.topLight.hasOpticalSignal) {
          this.platform.log.debug(`Detected opticalSignal feature for ${notificationChannel.label}`);
        }
      } else {
        this.platform.log.error('Light for button 1 not available on %s', accessory.context.device.label);
      }

      /* Create service for bottom light */
      channel = accessory.context.device.functionalChannels[HmIPBottomLightChannelIndex];
      this.button2Led = <Service>this.accessory.getServiceById(this.platform.Service.Lightbulb, 'Button2');
      if (channel?.functionalChannelType === 'NOTIFICATION_LIGHT_CHANNEL') {
        const notificationChannel = channel as NotificationLightChannel;
        if (!this.button2Led) {
          this.button2Led = new this.platform.Service.Lightbulb(notificationChannel.label, 'Button2');
          if (this.button2Led) {
            this.button2Led = this.accessory.addService(this.button2Led);
          } else {
            this.platform.log.error('Error adding service to %s for button 2 led', accessory.context.device.label);
          }
        } 
        this.bottomLight = new NotificationLight('Button 2', notificationChannel, this.button2Led);
        if (this.bottomLight.hasOpticalSignal) {
          this.platform.log.debug(`Detected opticalSignal feature for ${notificationChannel.label}`);
        }
      } else {
        this.platform.log.error('Light for button 2 not available on %s', accessory.context.device.label);
      }

      /* Bind handlers for top light */
      this.button1Led.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.buttonLedOnGet(this.topLight))
        .onSet(value => this.buttonLedOnSet(this.topLight, Boolean(value)));
      
      this.button1Led.getCharacteristic(this.platform.Characteristic.Brightness)
        .onGet(() => this.buttonLedBrightnessGet(this.topLight))
        .onSet(value => this.buttonLedBrightnessSet(this.topLight, Number(value)));

      this.button1Led.getCharacteristic(this.platform.Characteristic.Hue)
        .onGet(() => this.buttonLedHueGet(this.topLight))
        .onSet(value => this.buttonLedHueSet(this.topLight, Number(value)));

      this.button1Led.getCharacteristic(this.platform.Characteristic.Saturation)
        .onGet(() => this.buttonLedSaturationGet(this.topLight))
        .onSet(value => this.buttonLedSaturationSet(this.topLight, Number(value)));

      if (this.topLight.hasOpticalSignal) {
        this.button1Led.addOptionalCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal);
        this.button1Led.getCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal)
          .onGet(() => this.buttonLedOpticalSignalGet(this.topLight))
          .onSet(value => this.buttonLedOpticalSignalSet(this.topLight, String(value)));
      }

      /* Bind handlers for bottom light */
      this.button2Led.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.buttonLedOnGet(this.bottomLight))
        .onSet(value => this.buttonLedOnSet(this.bottomLight, Boolean(value)));
      
      this.button2Led.getCharacteristic(this.platform.Characteristic.Brightness)
        .onGet(() => this.buttonLedBrightnessGet(this.bottomLight))
        .onSet(value => this.buttonLedBrightnessSet(this.bottomLight, Number(value)));

      this.button2Led.getCharacteristic(this.platform.Characteristic.Hue)
        .onGet(() => this.buttonLedHueGet(this.bottomLight))
        .onSet(value => this.buttonLedHueSet(this.bottomLight, Number(value)));

      this.button2Led.getCharacteristic(this.platform.Characteristic.Saturation)
        .onGet(() => this.buttonLedSaturationGet(this.bottomLight))
        .onSet(value => this.buttonLedSaturationSet(this.bottomLight, Number(value)));

      if (this.bottomLight.hasOpticalSignal) {
        this.button2Led.addOptionalCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal);
        this.button2Led.getCharacteristic(this.platform.customCharacteristic.characteristic.OpticalSignal)
          .onGet(() => this.buttonLedOpticalSignalGet(this.bottomLight))
          .onSet(value => this.buttonLedOpticalSignalSet(this.bottomLight, String(value)));
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

  }


  /*
   * Switch handlers
   */
  private async handleOnSet(value: CharacteristicValue): Promise<void> {
    this.platform.log.debug('Setting switch %s to %s', this.accessory.displayName, value ? 'ON' : 'OFF');
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      on: value,
    };
    await this.platform.connector.command('device/control/setSwitchState', body);
  }


  /*
   * Light On characteristic handlers
   */
  buttonLedOnGet(light: NotificationLight): number {
    this.platform.log.debug('Get light state of %s:%s (%s)', this.accessory.displayName, light.label,
      light.on ? 'ON' : 'OFF');
    return (light.on ? 1 : 0);
  }

  async buttonLedOnSet(light: NotificationLight, value: boolean): Promise<void> {
    this.platform.log.debug('Set light state of %s:%s to %s', this.accessory.displayName, light.label,
      value ? 'ON' : 'OFF');
    if (!value) {
      await this.apiSetLight(light.index, undefined, 0, 'BLACK');
    } else if (light.simpleColor === 'BLACK' || light.opticalSignal === 'OFF') {
      await this.apiSetLight(light.index, 'ON', 100, 'WHITE');
    } else if (light.brightness === 0) {
      await this.buttonLedBrightnessSet(light, 100);
    }
  }


  /*
   * Light Brightness characteristic handlers
   */
  buttonLedBrightnessGet(light: NotificationLight): number {
    this.platform.log.debug('Get light brightness of %s:%s (%d)', this.accessory.displayName, light.label,
      light.brightness);
    return light.brightness;
  }

  async buttonLedBrightnessSet(light: NotificationLight, value: number): Promise<void> {
    if (light.brightness !== value) {
      light.brightness = value;
      await this.apiSetLight(light.index, light.opticalSignal, value, light.simpleColor);
      this.platform.log.debug('Set light brightness of %s:%s to %d %%', this.accessory.displayName,
		light.label, value);
    }
  }


  /*
   * Light Hue characteristic handlers
   */
  buttonLedHueGet(light: NotificationLight): number {
    this.platform.log.debug('Get light hue of %s:%s (%d)', this.accessory.displayName, light.label,
      light.hue);
    return light.hue;
  }

  async buttonLedColorSet(light: NotificationLight) {
    const color = this.getNearestHmIPColorFromHSL(light.hue, light.saturation, light.lightness);
    if (light.simpleColor !== color) {
      light.simpleColor = color;
      this.platform.log.debug('Set light color of %s:%s to %s', this.accessory.displayName,
		light.label, color);
      await this.apiSetLight(light.index, light.opticalSignal, light.brightness, color);
    }
  }

  private async buttonLedHueSet(light: NotificationLight, value: number): Promise<void> {
    if (light.hue !== value) {
      light.hue = value;
      await this.buttonLedColorSet(light);
    }
  }


  /*
   * Light Saturation characteristic handlers
   */
  buttonLedSaturationGet(light: NotificationLight): number {
    this.platform.log.debug('Get light saturation of %s:%s (%d)', this.accessory.displayName, light.label,
      light.saturation);
    return light.saturation;
  }

  private async buttonLedSaturationSet(light: NotificationLight, value: number): Promise<void> {
    if (light.saturation !== value) {
      light.saturation = value;
      await this.buttonLedColorSet(light);
    }
  }


  /*
   * Light OpticalSignal characteristic handlers
   */
  buttonLedOpticalSignalGet(light: NotificationLight): string {
    this.platform.log.debug('Get optical signal of %s:%s (%s)', this.accessory.displayName, light.label,
      light.opticalSignal);
    return light.opticalSignal ?? 'OFF';
  }

  async buttonLedOpticalSignalSet(light: NotificationLight, value: string): Promise<void> {
    if (HmIPOpticalSignalAllowedValues.includes(value.toUpperCase())) {
      value = value.toUpperCase();
      if (light.opticalSignal !== value) {
        light.opticalSignal = value;
        this.platform.log.debug('Set optical signal of %s:%s to %s', this.accessory.displayName,
		light.label, value);
        await this.apiSetLight(light.index, value, light.brightness, light.simpleColor);
      }
    } else {
      this.platform.log.info('Invalid optical signal value of %s:%s to %s', this.accessory.displayName,
		light.label, value);
    }
  }


  /*
   * Send light status to phsyical device
   */
  async apiSetLight(index: number, opticalSignal: string | undefined,
		    brightness: number, simpleColor: string | undefined) {
    if (simpleColor === undefined) {
      simpleColor = (brightness === 0 ? 'BLACK' : 'WHITE');
    }
    if (opticalSignal !== undefined) {
      if (opticalSignal === 'OFF' && brightness > 0) {
        opticalSignal = 'ON';
      } else if (opticalSignal !== 'OFF' && brightness === 0) {
        opticalSignal = 'OFF';
      }
      const body = {
        channelIndex: index,
        deviceId: this.accessory.context.device.id,
        opticalSignalBehaviour: opticalSignal,
        dimLevel: brightness / 100.0,
        simpleRGBColorState : simpleColor,
      };
      await this.platform.connector.command('device/control/setOpticalSignal', body);
    } else {
      const body = {
        channelIndex: index,
        deviceId: this.accessory.context.device.id,
        dimLevel: brightness / 100.0,
        simpleRGBColorState : simpleColor,
      };
      await this.platform.connector.command('device/control/setSimpleRGBColorDimLevel', body);
    }
  }


  /*
   * Update state of lights
   */
  updateLightState(light : NotificationLight, channel : NotificationLightChannel){
    if (light.service !== undefined) {
      let onstate = null;
      
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
        } else if (newColor !== light.simpleColor) {
          light.simpleColor = newColor;
          if (newColor !== 'BLACK') {
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
	  if (light.opticalSignal === 'OFF') {
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
  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
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
	if (notificationLightChannel.index === this.topLight.index) {
          this.updateLightState(this.topLight, notificationLightChannel);
        } else if (notificationLightChannel.index === this.bottomLight.index) {
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
