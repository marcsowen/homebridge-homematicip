import type {Service} from 'homebridge';

import type {HmIPPlatform} from '../HmIPPlatform.js';
import {
  type HmIPDevice,
  type HmIPFunctionalChannel,
  type HmIPGroup,
  hasFunctionalChannelType,
  isHmIPRecord,
} from '../HmIPState.js';
import type {HmIPPlatformAccessory} from '../HmIPTypes.js';

interface DeviceBaseChannel extends HmIPFunctionalChannel {
  functionalChannelType: 'DEVICE_OPERATIONLOCK' | 'DEVICE_BASE' | 'DEVICE_SABOTAGE';
  unreach: boolean | null;
  lowBat: boolean | null;
  supportedOptionalFeatures: {
    IOptionalFeatureLowBat: boolean;
  };
}

function isDeviceBaseChannel(channel: HmIPFunctionalChannel): channel is DeviceBaseChannel {
  if (!hasFunctionalChannelType(channel, 'DEVICE_OPERATIONLOCK', 'DEVICE_BASE', 'DEVICE_SABOTAGE')) {
    return false;
  }
  const candidate: unknown = channel;
  return isHmIPRecord(candidate)
    && (candidate.unreach === null || typeof candidate.unreach === 'boolean')
    && (candidate.lowBat === null || typeof candidate.lowBat === 'boolean')
    && isHmIPRecord(candidate.supportedOptionalFeatures)
    && typeof candidate.supportedOptionalFeatures.IOptionalFeatureLowBat === 'boolean';
}

/**
 * Generic device
 */
export abstract class HmIPGenericDevice {

  public hidden = false;
  protected unreach = false;
  protected lowBat = false;
  protected rssiDeviceValue = 0;
  protected rssiPeerValue = 0;
  protected dutyCycle = false;
  protected configPending = false;
  protected featureSabotage = false;
  protected accessoryConfig;
  private readonly batteryService: Service | undefined;

  protected constructor(
    protected readonly platform: HmIPPlatform,
    public readonly accessory: HmIPPlatformAccessory,
  ) {

    this.accessoryConfig = platform.config.devices?.[accessory.context.device.id];
    this.hidden = this.accessoryConfig?.hide === true;

    this.accessory.getService(this.platform.Service.AccessoryInformation)?.setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.oem)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.modelType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion);

    const hmIPDevice = accessory.context.device;
    let featureLowBat = false;

    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (isDeviceBaseChannel(channel)) {
        if (channel.unreach !== null) {
          this.unreach = channel.unreach;
        }

        featureLowBat = channel.supportedOptionalFeatures.IOptionalFeatureLowBat;
        if (featureLowBat && channel.lowBat !== null) {
          this.lowBat = channel.lowBat;
        }

        if (channel.functionalChannelType === 'DEVICE_SABOTAGE') {
          this.featureSabotage = true;
        }
      }
    }

    if (featureLowBat) {
      this.batteryService = this.accessory.getService(this.platform.Service.Battery)
        || this.accessory.addService(this.platform.Service.Battery);
      this.batteryService?.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .onGet(() => this.lowBat
          ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    }
  }

  public updateDevice(hmIPDevice: HmIPDevice, _groups: Readonly<Record<string, HmIPGroup>>) {
    this.updateFirmwareRevision(hmIPDevice.firmwareVersion);

    for (const channel of Object.values(hmIPDevice.functionalChannels)) {
      if (isDeviceBaseChannel(channel)) {
        if (channel.unreach !== null && channel.unreach !== this.unreach) {
          this.unreach = channel.unreach;
          this.platform.log.info('Unreach of %s changed to %s', this.accessory.displayName, this.unreach);
        }

        if (this.batteryService && channel.lowBat !== null && channel.lowBat !== this.lowBat) {
          this.lowBat = channel.lowBat;
          this.platform.log.info('LowBat of %s changed to %s', this.accessory.displayName, this.lowBat);
          this.batteryService.setCharacteristic(this.platform.Characteristic.StatusLowBattery,
            this.lowBat ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
              : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
        }
      }
    }
  }

  private updateFirmwareRevision(firmwareVersion: string): void {
    if (firmwareVersion === this.accessory.context.device.firmwareVersion) {
      return;
    }

    const previousFirmwareVersion = this.accessory.context.device.firmwareVersion;
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.updateCharacteristic(this.platform.Characteristic.FirmwareRevision, firmwareVersion);

    // Persist only technical metadata. In particular, do not copy the HmIP label
    // or update displayName/Characteristic.Name, as those may be customized in HomeKit.
    this.accessory.context.device.firmwareVersion = firmwareVersion;
    this.platform.api.updatePlatformAccessories([this.accessory]);
    this.platform.log.info(
      'Firmware revision of %s changed from %s to %s',
      this.accessory.displayName,
      previousFirmwareVersion,
      firmwareVersion,
    );
  }

  public dispose(): void {
    // Subclasses with timers or other resources override this hook.
  }
}
