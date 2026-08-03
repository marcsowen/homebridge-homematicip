import type {Service} from 'homebridge';
import type {HmIPDevice, HmIPGroup, MotionDetectionSendInterval, SabotageChannel} from 'homematicip-cloud-client-ts';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface PresenceDetectionChannel {
    functionalChannelType: string;
    presenceDetected: boolean;
    currentIllumination: number;
    illumination: number;
    motionBufferActive: boolean;
    motionDetectionSendInterval: MotionDetectionSendInterval;
    numberOfBrightnessMeasurements: number;
}

/**
 * HomematicIP presence detector
 *
 * HmIP-SPI (Presence Sensor - indoor)
 *
 */
export class HmIPPresenceDetector extends HmIPGenericDevice {
  private service: Service;

  private presenceDetected = false;
  private sabotage = false;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug('Created PresenceDetector %s', accessory.context.device.label);
    this.service = this.getOrAddService(this.platform.Service.OccupancySensor, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .onGet(() => this.presenceDetected
        ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
        : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);

    if (this.featureSabotage) {
      this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
        .onGet(() => this.sabotage
          ? this.platform.Characteristic.StatusTampered.TAMPERED
          : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
    }

  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'PRESENCE_DETECTION_CHANNEL') {
        const presenceDetectionChannel = <PresenceDetectionChannel>channel;
        this.platform.log.debug('Presence detector update: %s', JSON.stringify(channel));

        if (presenceDetectionChannel.presenceDetected !== null && presenceDetectionChannel.presenceDetected !== this.presenceDetected) {
          this.presenceDetected = presenceDetectionChannel.presenceDetected;
          this.platform.log.debug('Presence detector state of %s changed to %s', this.accessory.displayName, this.presenceDetected);
          this.service.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.presenceDetected
            ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
        }
      }

      if (channel.functionalChannelType === 'DEVICE_SABOTAGE') {
        const sabotageChannel = <SabotageChannel>channel;
        if (sabotageChannel.sabotage !== null && sabotageChannel.sabotage !== this.sabotage) {
          this.sabotage = sabotageChannel.sabotage;
          this.platform.log.info('Sabotage state of %s changed to %s', this.accessory.displayName, this.sabotage);
          this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.sabotage
            ? this.platform.Characteristic.StatusTampered.TAMPERED
            : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
        }
      }

    }
  }
}
