import {CharacteristicGetCallback, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup} from '../HmIPState';

interface DeviceBaseChannel {
  functionalChannelType: string;
  unreach: boolean;
  lowBat: boolean;
  rssiDeviceValue: number;
  rssiPeerValue: number;
  dutyCycle: false;
  configPending: false;
}

/**
 * Generic device
 */
export abstract class HmIPGenericDevice {

  protected unreach = false;
  protected lowBat = false;
  protected rssiDeviceValue = 0.0;
  protected rssiPeerValue = 0;
  protected dutyCycle = false;
  protected configPending = false;
  private batteryService: Service;

  protected constructor(
    protected readonly platform: HmIPPlatform,
    public readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.oem)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.modelType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion);

    this.batteryService = this.accessory.getService(this.platform.Service.BatteryService) || this.accessory.addService(this.platform.Service.BatteryService)!;
    this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel) // this is actually optional since iOS 14
      .on('get', this.handleBatteryLevelGet.bind(this));
    this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState) // this is actually optional since iOS 14
      .on('get', this.handleChargingStateGet.bind(this));
    this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .on('get', this.handleStatusLowBatteryGet.bind(this));
  }

  handleBatteryLevelGet(callback: CharacteristicGetCallback) {
    callback(null, (this.lowBat ? 0 : 100));
  }

  handleChargingStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.platform.Characteristic.ChargingState.NOT_CHARGEABLE);
  }

  handleStatusLowBatteryGet(callback: CharacteristicGetCallback) {
    callback(null, (this.lowBat ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL));
  }

  protected updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'DEVICE_OPERATIONLOCK' || channel.functionalChannelType === 'DEVICE_BASE') {
        const baseChannel = <DeviceBaseChannel>channel;

        if (baseChannel.unreach != null && baseChannel.unreach !== this.unreach) {
          this.platform.log.info(`Unreach of ${this.accessory.displayName} changed to ${baseChannel.unreach}`);
          this.unreach = baseChannel.unreach;
        }

        if (baseChannel.lowBat !== null && baseChannel.lowBat !== this.lowBat) {
          this.platform.log.info(`LowBat of ${this.accessory.displayName} changed to ${baseChannel.lowBat}`);
          this.lowBat = baseChannel.lowBat;
          this.batteryService.setCharacteristic(this.platform.Characteristic.StatusLowBattery,
            this.lowBat ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
              : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
          this.batteryService.setCharacteristic(this.platform.Characteristic.BatteryLevel, this.lowBat ? 0 : 100);
        }
      }
    }
  }
}
