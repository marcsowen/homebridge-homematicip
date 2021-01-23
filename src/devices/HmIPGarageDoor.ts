import {
    Characteristic,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    PlatformAccessory,
    Service
} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, Updateable} from '../HmIPState';
import {HmIPGenericDevice} from './HmIPGenericDevice';
import * as HomeKitTypes from "hap-nodejs/dist/lib/gen";

enum DoorState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    VENTILATION_POSITION = "VENTILATION_POSITION",
    POSITION_UNKNOWN = "POSITION_UNKNOWN"
}

enum DoorCommand {
    OPEN = "OPEN",
    STOP = "STOP",
    CLOSE = "CLOSE",
    PARTIAL_OPEN = "PARTIAL_OPEN"
}

interface DoorChannel {
    functionalChannelType: string;
    doorState: DoorState
    on: boolean;
    processing: boolean;
    ventilationPositionSupported: boolean;
}

/**
 * HomematicIP garage door
 *
 * HMIP-MOD-TM (Garage Door Module Tormatic)
 * HMIP-MOD-HO (Garage Door Module for Hörmann)
 *
 */
export class HmIPGarageDoor extends HmIPGenericDevice implements Updateable {
    private service: Service;

    private currentDoorState: DoorState = DoorState.CLOSED;
    private processing: boolean = false;
    private on: boolean = false;

    private targetDoorState: number = this.platform.Characteristic.TargetDoorState.CLOSED;

    constructor(
        platform: HmIPPlatform,
        home: HmIPHome,
        accessory: PlatformAccessory,
    ) {
        super(platform, home, accessory);

        this.platform.log.debug(`Created garage door ${accessory.context.device.label}`);
        this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) || this.accessory.addService(this.platform.Service.GarageDoorOpener);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.label);

        this.updateDevice(home, accessory.context.device, platform.groups);

        this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
            .on('get', this.handleCurrentDoorStateGet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
            .on('get', this.handleTargetDoorStateGet.bind(this))
            .on('set', this.handleTargetDoorStateSet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
            .on('get', this.handleObstructionDetectedGet.bind(this));
    }

    handleCurrentDoorStateGet(callback: CharacteristicGetCallback) {
        callback(null, this.getHmKitCurrentDoorState(this.currentDoorState));
    }

    handleTargetDoorStateGet(callback: CharacteristicGetCallback) {
        callback(null, this.targetDoorState);
    }

    async handleTargetDoorStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.platform.log.info("Setting garage door %s to %s", this.accessory.displayName,
            value === this.platform.Characteristic.TargetDoorState.OPEN ? "open" : "closed");
        this.targetDoorState = <number>value;
        const body = {
            channelIndex: 1,
            deviceId: this.accessory.context.device.id,
            doorCommand: value === this.platform.Characteristic.TargetDoorState.OPEN ? DoorCommand.OPEN : DoorCommand.CLOSE,
        };
        await this.platform.connector.apiCall('device/control/sendDoorCommand', body);
        callback(null);
    }

    handleObstructionDetectedGet(callback: CharacteristicGetCallback) {
        callback(null, false);
    }

    public updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }) {
        super.updateDevice(hmIPHome, hmIPDevice, groups);
        this.home = hmIPHome;
        for (const id in hmIPDevice.functionalChannels) {
            const channel = hmIPDevice.functionalChannels[id];
            if (channel.functionalChannelType === 'DOOR_CHANNEL') {
                const doorChannel = <DoorChannel>channel;
                this.platform.log.debug(`Garage door update: ${JSON.stringify(channel)}`);

                if (doorChannel.doorState != null && doorChannel.doorState != this.currentDoorState) {
                    this.currentDoorState = doorChannel.doorState;
                    this.platform.log.info("Garage door state of %s changed to %s", this.accessory.displayName, this.currentDoorState);
                    if (this.currentDoorState != DoorState.POSITION_UNKNOWN) {
                        this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState,
                            this.getHmKitCurrentDoorState(this.currentDoorState));
                    }
                }

                if (doorChannel.processing != null && doorChannel.processing != this.processing) {
                    this.processing = doorChannel.processing;
                    this.platform.log.info("Garage door processing state of %s changed to %s", this.accessory.displayName, this.processing);
                    if (this.processing) {
                        this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState,
                            this.platform.Characteristic.CurrentDoorState.OPENING);
                    } else if (this.currentDoorState != DoorState.OPEN && this.currentDoorState != DoorState.CLOSED){
                        this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState,
                            this.platform.Characteristic.CurrentDoorState.STOPPED);
                    }
                }

                if (doorChannel.on != null && doorChannel.on != this.on) {
                    this.on = doorChannel.on;
                    this.platform.log.info("Garage door on state of %s changed to %s", this.accessory.displayName, this.on);
                }
            }
        }
    }

    private getHmKitCurrentDoorState(hmIPDoorState: DoorState): number {
        switch (hmIPDoorState) {
            case DoorState.CLOSED:
                return this.platform.Characteristic.CurrentDoorState.CLOSED;
            case DoorState.OPEN:
                return this.platform.Characteristic.CurrentDoorState.OPEN;
            case DoorState.VENTILATION_POSITION:
                return this.platform.Characteristic.CurrentDoorState.STOPPED;
            case DoorState.POSITION_UNKNOWN:
                return this.platform.Characteristic.CurrentDoorState.OPENING;
        }
    }

}
