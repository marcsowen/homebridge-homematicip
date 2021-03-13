import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup} from '../HmIPState';

interface SupportedOptionalFeatures {
  IFeatureDeviceParticulateMatterSensorCommunicationError: boolean;
  IFeatureDeviceCoProRestart: boolean;
  IFeatureDeviceOverheated: boolean;
  IOptionalFeatureDutyCycle: boolean;
  IFeatureMulticastRouter: boolean;
  IFeatureDeviceCoProUpdate: boolean;
  IFeaturePowerShortCircuit: boolean;
  IFeatureDevicePowerFailure: boolean;
  IFeatureDeviceTemperatureHumiditySensorCommunicationError: boolean;
  IFeatureShortCircuitDataLine: boolean;
  IFeatureRssiValue: boolean;
  IFeatureBusConfigMismatch: boolean;
  IFeatureDeviceUndervoltage: boolean;
  IFeatureDeviceParticulateMatterSensorError: boolean;
  IFeatureDeviceOverloaded: boolean;
  IFeatureDeviceCoProError: boolean;
  IFeatureDeviceIdentify: boolean;
  IOptionalFeatureLowBat: boolean;
  IOptionalFeatureMountingOrientation: boolean;
  IFeatureDeviceTemperatureHumiditySensorError: boolean;
  IFeatureDeviceTemperatureOutOfRange: boolean;
}

interface DeviceBaseChannel {
  functionalChannelType: string;
  unreach: boolean;
  lowBat: boolean;
  rssiDeviceValue: number;
  rssiPeerValue: number;
  dutyCycle: boolean;
  configPending: boolean;
  supportedOptionalFeatures: SupportedOptionalFeatures;
}

/**
 * Generic device
 */
export abstract class HmIPGenericDevice {

  protected unreach = false;
  protected lowBat = false;
  protected rssiDeviceValue = 0;
  protected rssiPeerValue = 0;
  protected dutyCycle = false;
  protected configPending = false;
  private readonly batteryService: Service | undefined;

  protected constructor(
    protected readonly platform: HmIPPlatform,
    public readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.oem)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.modelType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion);

    const hmIPDevice = <HmIPDevice>accessory.context.device;
    let featureLowBat = false;

    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'DEVICE_OPERATIONLOCK' || channel.functionalChannelType === 'DEVICE_BASE') {
        const baseChannel = <DeviceBaseChannel>channel;

        featureLowBat = baseChannel.supportedOptionalFeatures.IOptionalFeatureLowBat;
        break;
      }
    }

    if (featureLowBat) {
      this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)!;
      this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .on('get', this.handleStatusLowBatteryGet.bind(this));

      const batteryLevel = this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel);
      if (batteryLevel != undefined) {
        this.platform.log.info("Removing obsolete battery level characteristic from %s", accessory.context.device.label);
        this.batteryService.removeCharacteristic(batteryLevel);
      }

      const chargingState = this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState);
      if (chargingState != undefined) {
        this.platform.log.info("Removing obsolete charging state characteristic from %s", accessory.context.device.label);
        this.batteryService.removeCharacteristic(chargingState);
      }
    } else {
      const batteryService = this.accessory.getService(this.platform.Service.Battery);
      if (batteryService != undefined) {
        this.platform.log.info("Removing obsolete battery service from %s", accessory.context.device.label);
        this.accessory.removeService(batteryService);
      }
    }
  }

  handleStatusLowBatteryGet(callback: CharacteristicGetCallback) {
    callback(null, (this.lowBat ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL));
  }

  protected updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'DEVICE_OPERATIONLOCK' || channel.functionalChannelType === 'DEVICE_BASE') {
        const baseChannel = <DeviceBaseChannel>channel;

        if (baseChannel.unreach != null && baseChannel.unreach !== this.unreach) {
          this.unreach = baseChannel.unreach;
          this.platform.log.info('Unreach of %s changed to %s', this.accessory.displayName, this.unreach);
        }

        if (this.batteryService && baseChannel.lowBat !== null && baseChannel.lowBat !== this.lowBat) {
          this.lowBat = baseChannel.lowBat;
          this.platform.log.info('LowBat of %s changed to %s', this.accessory.displayName, this.lowBat);
          this.batteryService.setCharacteristic(this.platform.Characteristic.StatusLowBattery,
            this.lowBat ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
              : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
        }
      }
    }
  }
}
