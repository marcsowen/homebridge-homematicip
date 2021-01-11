import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface AccessControllerChannel {
  index: number;
  groupIndex: number;
  functionalChannelType: string;
  dutyCycle: boolean;
  deviceOverloaded: boolean;
  coProUpdateFailure: boolean;
  coProFaulty: boolean;
  coProRestartNeeded: boolean;
  deviceUndervoltage: boolean;
  deviceOverheated: boolean;
  temperatureOutOfRange: boolean;
  devicePowerFailureDetected: boolean;
  signalBrightness: number;
  dutyCycleLevel: number;
  accessPointPriority: number;
  carrierSenseLevel: number;
  groups: string[];
  permanentlyReachable: boolean;
}

/**
 * HomematicIP Access Point
 */
export class HmIPHomeControlAccessPoint extends HmIPGenericDevice implements Updateable {

  private readonly batteryService: Service;
  private readonly lightService: Service;

  private dutyCycle: boolean = false;
  private signalBrightness: number = 1;
  private permanentlyReachable: boolean = false;

  constructor(
    platform: HmIPPlatform,
    home: HmIPHome,
    accessory: PlatformAccessory,
  ) {
    super(platform, home, accessory);

    this.batteryService = this.accessory.getService(this.platform.Service.BatteryService) || this.accessory.addService(this.platform.Service.BatteryService)!;
    this.lightService = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb)!;

    this.updateDevice(home, accessory.context.device, platform.groups);

    this.lightService.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.handlePermanentlyReachableGet.bind(this));
    this.lightService.getCharacteristic(this.platform.Characteristic.Brightness)
      .on('get', this.handleSignalBrightnessGet.bind(this))
      .on('set', this.handleSignalBrightnessSet.bind(this));

    this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .on('get', this.handleBatteryLevelGet.bind(this));
    this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState)
      .on('get', this.handleChargingStateGet.bind(this));
    this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .on('get', this.handleStatusLowBatteryGet.bind(this));

  }

  handlePermanentlyReachableGet(callback: CharacteristicGetCallback) {
    callback(null, (this.permanentlyReachable ? this.permanentlyReachable : true));
  }

  handleSignalBrightnessGet(callback: CharacteristicGetCallback) {
    callback(null, this.signalBrightness);
  }

  handleBatteryLevelGet(callback: CharacteristicGetCallback) {
    callback(null, (this.dutyCycle ? 0 : 100));
  }

  handleChargingStateGet(callback: CharacteristicGetCallback) {
    callback(null, (this.dutyCycle ? this.platform.Characteristic.ChargingState.CHARGING : this.platform.Characteristic.ChargingState.NOT_CHARGING));
  }

  handleStatusLowBatteryGet(callback: CharacteristicGetCallback) {
    callback(null, (this.dutyCycle ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL));
  }

  async handleSignalBrightnessSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info(`setSignalBrightness for ${this.accessory.displayName} to ${value}`);
    var number: number = Number(value);
    const body = {
      channelIndex: 0,
      deviceId: this.accessory.context.device.id,
      signalBrightness: number / 100,
    }
    await this.platform.connector.apiCall('device/configuration/setSignalBrightness', body)
    callback(null);
  }

  updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }): void {
    if (hmIPDevice) {
      if (hmIPDevice.permanentlyReachable != this.permanentlyReachable) {
        this.permanentlyReachable = hmIPDevice.permanentlyReachable;
        this.lightService.setCharacteristic(this.platform.Characteristic.On, this.permanentlyReachable);
      }
      if (hmIPDevice.functionalChannels) {
        for (const id in hmIPDevice.functionalChannels) {
          const channel = hmIPDevice.functionalChannels[id];
          if (channel.functionalChannelType === 'ACCESS_CONTROLLER_CHANNEL') {
            const wthChannel = <AccessControllerChannel>channel;
            this.platform.log.debug(`Updating device ${hmIPDevice.id} by channel: ${JSON.stringify(channel)}`);
            if (wthChannel.signalBrightness != this.signalBrightness) {
              this.signalBrightness = wthChannel.signalBrightness * 100;
              this.lightService.updateCharacteristic(this.platform.Characteristic.Brightness, this.signalBrightness);
            }
            if (wthChannel.dutyCycle != this.dutyCycle) {
              this.dutyCycle = wthChannel.dutyCycle;
              this.batteryService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, (this.dutyCycle ? 0 : 100));
              this.batteryService.updateCharacteristic(this.platform.Characteristic.ChargingState, (this.dutyCycle ? this.platform.Characteristic.ChargingState.CHARGING : this.platform.Characteristic.ChargingState.NOT_CHARGING));
              this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, (this.dutyCycle ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL));
            }
          }
        }
      }
    }
  }


}
