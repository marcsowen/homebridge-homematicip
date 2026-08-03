import type {Service} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPDevice, HmIPGroup, MotionDetectionSendInterval, SabotageChannel} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface MotionDetectionChannel {
    functionalChannelType: string;
    motionDetected: boolean;
    currentIllumination: number;
    illumination: number;
    motionBufferActive: boolean;
    motionDetectionSendInterval: MotionDetectionSendInterval;
    numberOfBrightnessMeasurements: number;
}

/**
 * HomematicIP motion detector
 *
 * HmIP-SMI (Motion Detector with Brightness Sensor - indoor)
 * HmIP-SMO-A (Motion Detector with Brightness Sensor - outdoor)
 * HmIP-SMI55 (Motion Detector with Brightness Sensor and Remote Control - 2-button)
 *
 */
export class HmIPMotionDetector extends HmIPGenericDevice {
  private motionSensorService: Service;
  private lightSensorService: Service | undefined;

  private motionDetected = false;
  private sabotage = false;
  private lightLevel = 1;

  private addLightSensor : boolean = false;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug('Created MotionDetector %s', accessory.context.device.label);
    this.motionSensorService = this.getOrAddService(
      this.platform.Service.MotionSensor,
      accessory.context.device.label,
    );

    this.motionSensorService.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    if (this.featureSabotage) {
      this.motionSensorService.getCharacteristic(this.platform.Characteristic.StatusTampered)
        .onGet(() => this.sabotage
          ? this.platform.Characteristic.StatusTampered.TAMPERED
          : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
    }

    this.addLightSensor = this.accessoryConfig?.lightSensor === true;

    if (this.addLightSensor) {
      this.lightSensorService = this.getOrAddService(
        this.platform.Service.LightSensor,
        accessory.context.device.label,
        'LightSensor',
      );

      this.lightSensorService.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.max(1, this.lightLevel));

    } else {
      const lightSensorService = this.accessory.getServiceById(this.platform.Service.LightSensor, 'LightSensor');
      if (lightSensorService !== undefined) {
        this.accessory.removeService(lightSensorService);
      }
    }

  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'MOTION_DETECTION_CHANNEL') {
        const motionDetectionChannel = <MotionDetectionChannel>channel;
        this.platform.log.debug('Motion detector update: %s', JSON.stringify(channel));

        if (motionDetectionChannel.motionDetected !== null && motionDetectionChannel.motionDetected !== this.motionDetected) {
          this.motionDetected = motionDetectionChannel.motionDetected;
          this.platform.log.debug('Motion detector state of %s changed to %s', this.accessory.displayName,
				  this.motionDetected);
          this.motionSensorService.updateCharacteristic(this.platform.Characteristic.MotionDetected,
							this.motionDetected);
        }
        if (motionDetectionChannel.illumination !== null && motionDetectionChannel.illumination !== this.lightLevel) {
          this.lightLevel = motionDetectionChannel.illumination;
          this.platform.log.debug('Illumination detector state of %s changed to %s', this.accessory.displayName,
				  this.lightLevel);
          this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel,
            Math.max(1, this.lightLevel));
        }
      }

      if (channel.functionalChannelType === 'DEVICE_SABOTAGE') {
        const sabotageChannel = <SabotageChannel>channel;
        if (sabotageChannel.sabotage !== null && sabotageChannel.sabotage !== this.sabotage) {
          this.sabotage = sabotageChannel.sabotage;
          this.platform.log.info('Sabotage state of %s changed to %s', this.accessory.displayName, this.sabotage);
          this.motionSensorService.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.sabotage
            ? this.platform.Characteristic.StatusTampered.TAMPERED
            : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
        }
      }

    }
  }
}
