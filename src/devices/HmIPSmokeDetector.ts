import type {Service} from 'homebridge';
import type {HmIPDevice, HmIPGroup} from 'homematicip-cloud-client-ts';
import type {HmIPPlatform} from '../HmIPPlatform.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

/**
 * SmokeDetectorAlarmType
 *
 * IDLE_OFF       : Idle, waiting for smoke
 * PRIMARY_ALARM  : This smoke detector signals smoke alarm triggered by itself
 * INTRUSION_ALARM: This smoke detector signals burglar alarm triggered by e.g. a window contact
 * SECONDARY_ALARM: This smoke detector signals smoke alarm triggered by another smoke detector
 *
 * Note: We only alert PRIMARY_ALARM since we want to detect where the smoke is actually coming from.
 *
 */
enum SmokeDetectorAlarmType {
    IDLE_OFF = 'IDLE_OFF',
    PRIMARY_ALARM = 'PRIMARY_ALARM',
    INTRUSION_ALARM = 'INTRUSION_ALARM',
    SECONDARY_ALARM = 'SECONDARY_ALARM'
}

interface SmokeDetectorChannel {
    functionalChannelType: string;
    smokeDetectorAlarmType: SmokeDetectorAlarmType;
}

/**
 * HomematicIP smoke detector
 *
 * HmIP-SWSD (Smoke Alarm with Q label)
 */
export class HmIPSmokeDetector extends HmIPGenericDevice {
  private service: Service;

  private smokeDetectorAlarmType = SmokeDetectorAlarmType.IDLE_OFF;

  constructor(
    platform: HmIPPlatform,
    accessory: HmIPPlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug('Created SmokeDetector %s', accessory.context.device.label);
    this.service = this.getOrAddService(this.platform.Service.SmokeSensor, accessory.context.device.label);

    this.service.getCharacteristic(this.platform.Characteristic.SmokeDetected)
      .onGet(() => this.smokeDetectorAlarmType === SmokeDetectorAlarmType.PRIMARY_ALARM
      ? this.platform.Characteristic.SmokeDetected.SMOKE_DETECTED
      : this.platform.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED);
  }

  public override updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (channel.functionalChannelType === 'SMOKE_DETECTOR_CHANNEL') {
        const smokeDetectorChannel = <SmokeDetectorChannel>channel;
        this.platform.log.debug('Smoke detector update: %s', JSON.stringify(channel));

        if (smokeDetectorChannel.smokeDetectorAlarmType !== null
          && smokeDetectorChannel.smokeDetectorAlarmType !== this.smokeDetectorAlarmType) {
          this.smokeDetectorAlarmType = smokeDetectorChannel.smokeDetectorAlarmType;
          this.platform.log.info('Smoke detector state of %s changed to %s', this.accessory.displayName, this.smokeDetectorAlarmType);
          this.service.updateCharacteristic(this.platform.Characteristic.SmokeDetected,
            this.smokeDetectorAlarmType === SmokeDetectorAlarmType.PRIMARY_ALARM
              ? this.platform.Characteristic.SmokeDetected.SMOKE_DETECTED
              : this.platform.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED);
        }
      }
    }
  }
}
