import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform.js';
import {HmIPDevice, HmIPGroup, Updateable} from '../HmIPState.js';
import {HmIPGenericDevice} from './HmIPGenericDevice.js';

interface SwitchMeasuringChannel {
    functionalChannelType: string;
    on: boolean;
    profileMode: string;
    userDesiredProfileMode: string;
    energyCounter: number;
    currentPowerConsumption: number;
}

/**
 * HomematicIP switch (measuring)
 *
 * HmIP-PSM (Pluggable Switch and Meter)
 * HmIP-BSM (Brand Switch and Meter)
 * HmIP-FSM, HMIP-FSM16 (Full flush Switch and Meter)
 *
 */
export class HmIPSwitchMeasuring extends HmIPGenericDevice implements Updateable {
  private service: Service;

  private on = false;
  private energyCounter = 0;
  private currentPowerConsumption = 0;

  constructor(
    platform: HmIPPlatform,
    accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.platform.log.debug('Created switch (measuring) %s', accessory.context.device.label);
    this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);
    this.service.addOptionalCharacteristic(this.platform.customCharacteristic.characteristic.ElectricPower);
    this.service.addOptionalCharacteristic(this.platform.customCharacteristic.characteristic.ElectricalEnergy);

    this.updateDevice(accessory.context.device, platform.groups);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.handleOnGet.bind(this))
      .on('set', this.handleOnSet.bind(this));

    this.service.getCharacteristic(this.platform.customCharacteristic.characteristic.ElectricPower)
      .on('get', this.handleElectricPowerGet.bind(this));

    this.service.getCharacteristic(this.platform.customCharacteristic.characteristic.ElectricalEnergy)
      .on('get', this.handleElectricalEnergyGet.bind(this));
  }

  handleOnGet(callback: CharacteristicGetCallback) {
    callback(null, this.on);
  }

  async handleOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('Setting switch %s to %s', this.accessory.displayName, value ? 'ON' : 'OFF');
    const body = {
      channelIndex: 1,
      deviceId: this.accessory.context.device.id,
      on: value,
    };
    await this.platform.connector.apiCall('device/control/setSwitchState', body);
    callback(null);
  }

  handleElectricPowerGet(callback: CharacteristicGetCallback) {
    callback(null, this.currentPowerConsumption);
  }

  handleElectricalEnergyGet(callback: CharacteristicGetCallback) {
    callback(null, this.energyCounter);
  }

  public updateDevice(hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
    super.updateDevice(hmIPDevice, groups);
    for (const id in hmIPDevice.functionalChannels) {
      const channel = hmIPDevice.functionalChannels[id];
      if (channel.functionalChannelType === 'SWITCH_MEASURING_CHANNEL') {
        const switchMeasuringChannel = <SwitchMeasuringChannel>channel;
        this.platform.log.debug('Switch (measuring) update: %s', JSON.stringify(channel));

        if (switchMeasuringChannel.on != null && switchMeasuringChannel.on !== this.on) {
          this.on = switchMeasuringChannel.on;
          this.platform.log.info('Switch state of %s changed to %s', this.accessory.displayName, this.on ? 'ON' : 'OFF');
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.on);
        }

        if (switchMeasuringChannel.currentPowerConsumption !== null
          && switchMeasuringChannel.currentPowerConsumption !== this.currentPowerConsumption) {
          this.currentPowerConsumption = switchMeasuringChannel.currentPowerConsumption;
          this.platform.log.debug('Switch power consumption of %s changed to %s W',
            this.accessory.displayName, this.currentPowerConsumption.toFixed(1));
          this.service.updateCharacteristic(this.platform.customCharacteristic.characteristic.ElectricPower, this.currentPowerConsumption);
        }

        if (switchMeasuringChannel.energyCounter !== null && switchMeasuringChannel.energyCounter !== this.energyCounter) {
          this.energyCounter = switchMeasuringChannel.energyCounter;
          this.platform.log.debug('Switch energy counter of %s changed to %s kWh',
            this.accessory.displayName, this.energyCounter.toFixed(3));
          this.service.updateCharacteristic(this.platform.customCharacteristic.characteristic.ElectricalEnergy, this.energyCounter);
        }
      }
    }
  }
}
