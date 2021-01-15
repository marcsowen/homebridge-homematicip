import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

enum SmokeDetectorAlarmType {
    IDLE_OFF = "IDLE_OFF",                  // Idle, waiting for smoke
    PRIMARY_ALARM = "PRIMARY_ALARM",        // Smoke
    INTRUSION_ALARM = "INTRUSION_ALARM",    // Tampered or alarm from window contact?
    SECONDARY_ALARM = "SECONDARY_ALARM"     // Alarm triggered by another smoke sensor or alarm from window contact?
}

interface SmokeDetectorChannel {
    functionalChannelType: string;
    smokeDetectorAlarmType: SmokeDetectorAlarmType;
}

/**
 * HomematicIP Window shutter contact
 */
export class HmIPSmokeDetector extends HmIPGenericDevice implements Updateable {
    private service: Service;

    private smokeDetectorAlarmType = SmokeDetectorAlarmType.IDLE_OFF;

    constructor(
        platform: HmIPPlatform,
        home: HmIPHome,
        accessory: PlatformAccessory,
    ) {
        super(platform, home, accessory);

        this.platform.log.debug(`Created SmokeDetector ${accessory.context.device.label}`);
        this.service = this.accessory.getService(this.platform.Service.SmokeSensor) || this.accessory.addService(this.platform.Service.SmokeSensor);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

        this.updateDevice(home, accessory.context.device, platform.groups);

        this.service.getCharacteristic(this.platform.Characteristic.SmokeDetected)
            .on('get', this.handleSmokeDetectedGet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
            .on('get', this.handleStatusTamperedGet.bind(this));
    }

    handleSmokeDetectedGet(callback: CharacteristicGetCallback) {
        callback(null, this.smokeDetectorAlarmType === SmokeDetectorAlarmType.PRIMARY_ALARM
            ? this.platform.Characteristic.SmokeDetected.SMOKE_DETECTED
            : this.platform.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED);
    }

    handleStatusTamperedGet(callback: CharacteristicGetCallback) {
        callback(null, this.smokeDetectorAlarmType === SmokeDetectorAlarmType.INTRUSION_ALARM
            ? this.platform.Characteristic.StatusTampered.TAMPERED
            : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
    }


    public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
        super.updateDevice(hmIPHome, hmIPDevice, groups);
        this.home = hmIPHome;
        for (const id in hmIPDevice.functionalChannels) {
            const channel = hmIPDevice.functionalChannels[id];
            if (channel.functionalChannelType === 'SMOKE_DETECTOR_CHANNEL') {
                const smokeDetectorChannel = <SmokeDetectorChannel>channel;
                this.platform.log.debug(`Smoke detector update: ${JSON.stringify(channel)}`);

                if (smokeDetectorChannel.smokeDetectorAlarmType !== null && smokeDetectorChannel.smokeDetectorAlarmType !== this.smokeDetectorAlarmType) {
                    this.platform.log.info(`Smoke detector state of ${this.accessory.displayName} changed to '${smokeDetectorChannel.smokeDetectorAlarmType}'`);
                    this.smokeDetectorAlarmType = smokeDetectorChannel.smokeDetectorAlarmType;
                    this.service.updateCharacteristic(this.platform.Characteristic.SmokeDetected,
                    this.smokeDetectorAlarmType === SmokeDetectorAlarmType.PRIMARY_ALARM
                        ? this.platform.Characteristic.SmokeDetected.SMOKE_DETECTED
                        : this.platform.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED);

                    this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered,
                        this.smokeDetectorAlarmType === SmokeDetectorAlarmType.INTRUSION_ALARM
                            ? this.platform.Characteristic.StatusTampered.TAMPERED
                            : this.platform.Characteristic.StatusTampered.NOT_TAMPERED);
                }
            }
        }
    }
}
