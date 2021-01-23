import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';

interface SwitchChannel {
    functionalChannelType: string;
    on: boolean;
    profileMode: string;
    userDesiredProfileMode: string;
}

interface SwitchMeasuringChannel {
    functionalChannelType: string;
    on: boolean;
    profileMode: string;
    userDesiredProfileMode: string;
    energyCounter: number;
    currentPowerConsumption: number;
}

/**
 * HomematicIP switch
 *
 * Switches
 *
 * HMIP-PS (Pluggable Switch)
 * HMIP-PCBS (Switch Circuit Board - 1 channel)
 * HMIP-PCBS-BAT (Printed Circuit Board Switch Battery)
 * HMIP-PCBS2 (Switch Circuit Board - 2x channels)
 * HMIP-MOD-OC8 ( Open Collector Module )
 * HMIP-WHS2 (Switch Actuator for heating systems – 2x channels)
 * HMIPW-DRS8 (Homematic IP Wired Switch Actuator – 8x channels)
 * HMIP-DRSI4 (Homematic IP Switch Actuator for DIN rail mount – 4x channels) """
 *
 * Measuring switches
 *
 * HMIP-PSM (Pluggable Switch and Meter)
 * HMIP-BSM (Brand Switch and Meter)
 * HMIP-FSM, HMIP-FSM16 (Full flush Switch and Meter)
 *
 */
export class HmIPSwitch extends HmIPGenericDevice implements Updateable {
    private service: Service;

    private on: boolean = false;

    constructor(
        platform: HmIPPlatform,
        home: HmIPHome,
        accessory: PlatformAccessory,
    ) {
        super(platform, home, accessory);

        this.platform.log.debug(`Created switch ${accessory.context.device.label}`);
        this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

        this.updateDevice(home, accessory.context.device, platform.groups);

        this.service.getCharacteristic(this.platform.Characteristic.On)
            .on('get', this.handleOnGet.bind(this))
            .on('set', this.handleOnSet.bind(this));
    }

    handleOnGet(callback: CharacteristicGetCallback) {
        callback(null, this.on);
    }

    async handleOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.platform.log.info("Setting switch %s to %s", this.accessory.displayName, value ? "on" : "off");
        const body = {
            channelIndex: 1,
            deviceId: this.accessory.context.device.id,
            on: value,
        };
        await this.platform.connector.apiCall('device/control/setSwitchState', body);
        callback(null);
    }

    public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
        super.updateDevice(hmIPHome, hmIPDevice, groups);
        this.home = hmIPHome;
        for (const id in hmIPDevice.functionalChannels) {
            const channel = hmIPDevice.functionalChannels[id];
            if (channel.functionalChannelType === 'SWITCH_CHANNEL') {
                const switchChannel = <SwitchChannel>channel;
                this.platform.log.debug(`Switch update: ${JSON.stringify(channel)}`);

                if (switchChannel.on != this.on) {
                    this.on = switchChannel.on;
                    this.platform.log.info("Switch state of %s changed to %s", this.accessory.displayName, this.on ? "on" : "off");
                    this.service.updateCharacteristic(this.platform.Characteristic.On, this.on);
                }
            }

            if (channel.functionalChannelType == "SWITCH_MEASURING_CHANNEL") {
                const switchMeasuringChannel = <SwitchMeasuringChannel>channel;
                this.platform.log.debug(`Switch (measuring) update: ${JSON.stringify(channel)}`);

                if (switchMeasuringChannel.on != this.on) {
                    this.on = switchMeasuringChannel.on;
                    this.platform.log.info("Switch state of %s changed to %s", this.accessory.displayName, this.on ? "on" : "off");
                    this.service.updateCharacteristic(this.platform.Characteristic.On, this.on);
                }
            }
        }
    }
}
