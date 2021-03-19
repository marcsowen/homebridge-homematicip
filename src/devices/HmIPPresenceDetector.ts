import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, MotionDetectionSendInterval, SabotageChannel, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

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
export class HmIPPresenceDetector extends HmIPGenericDevice implements Updateable {
    private service: Service;

    private presenceDetected = false;
    private sabotage = false;

    constructor(
        platform: HmIPPlatform,
        accessory: PlatformAccessory,
    ) {
        super(platform, accessory);

        this.platform.log.debug('Created PresenceDetector %s', accessory.context.device.label);
        this.service = this.accessory.getService(this.platform.Service.OccupancySensor) || this.accessory.addService(this.platform.Service.OccupancySensor);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

        this.service.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
          .on('get', this.handleOccupancyDetectedGet.bind(this));

        if (this.featureSabotage) {
            this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
              .on('get', this.handleStatusTamperedGet.bind(this));
        }

        this.updateDevice(accessory.context.device, platform.groups);
    }

    handleOccupancyDetectedGet(callback: CharacteristicGetCallback) {
        callback(null, this.presenceDetected
          ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
          : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
    }

    handleStatusTamperedGet(callback: CharacteristicGetCallback) {
        callback(null, this.sabotage
          ? this.platform.Characteristic.StatusTampered.TAMPERED
          : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
    }

    public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
        super.updateDevice(hmIPDevice, groups);
        for (const id in hmIPDevice.functionalChannels) {
            const channel = hmIPDevice.functionalChannels[id];
            if (channel.functionalChannelType === 'PRESENCE_DETECTION_CHANNEL') {
                const presenceDetectionChannel = <PresenceDetectionChannel>channel;
                this.platform.log.debug('Presence detector update: %s', JSON.stringify(channel));

                if (presenceDetectionChannel.presenceDetected !== null && presenceDetectionChannel.presenceDetected !== this.presenceDetected) {
                    this.presenceDetected = presenceDetectionChannel.presenceDetected;
                    this.platform.log.info('Presence detector state of %s changed to %s', this.accessory.displayName, this.presenceDetected);
                    this.service.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.presenceDetected
                      ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
                      : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
                }
            }

            if (channel.functionalChannelType === 'DEVICE_SABOTAGE') {
                const sabotageChannel = <SabotageChannel>channel;
                if (sabotageChannel.sabotage != null && sabotageChannel.sabotage !== this.sabotage) {
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
