import type {Service} from "homebridge";
import type {HmIPDevice, HmIPGroup} from "homematicip-cloud-client-ts";
import {connectedGet} from "../HmIPAvailability.js";
import type {HmIPPlatform} from "../HmIPPlatform.js";
import type {HmIPPlatformAccessory} from "../HmIPTypes.js";
import {HmIPGenericDevice} from "./HmIPGenericDevice.js";

interface LightSensorChannel {
    functionalChannelType: string;
    averageIllumination: number;
    currentIllumination: number;
    highestIllumination: number;
    lowestIllumination: number;
}

// HomeKit rejects light levels outside 0.0001-100000 lx; the cloud reports 0 lx in darkness.
export function toHomeKitLightLevel(lux: number): number {
    return Math.min(100000, Math.max(0.0001, lux));
}

/**
 * HomematicIP light sensor
 *
 * HmIP-SLO (Light Sensor outdoor)
 */
export class HmIPLightSensor extends HmIPGenericDevice {
    private service: Service;

    private averageIllumination = 0;

    constructor(platform: HmIPPlatform, accessory: HmIPPlatformAccessory) {
        super(platform, accessory);

        this.platform.log.debug("Created light sensor %s", accessory.context.device.label);
        this.service = this.getOrAddService(this.platform.Service.LightSensor, accessory.context.device.label);

        this.service
            .getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
            .onGet(connectedGet(this.platform, () => toHomeKitLightLevel(this.averageIllumination)));
    }

    public override updateDevice(hmIPDevice: HmIPDevice, groups: {[key: string]: HmIPGroup}) {
        super.updateDevice(hmIPDevice, groups);
        for (const channel of Object.values(hmIPDevice.functionalChannels)) {
            if (channel.functionalChannelType === "LIGHT_SENSOR_CHANNEL") {
                const lightSensorChannel = <LightSensorChannel>channel;
                this.platform.log.debug("Light sensor update: %s", JSON.stringify(channel));

                if (
                    lightSensorChannel.averageIllumination !== null &&
                    lightSensorChannel.averageIllumination !== this.averageIllumination
                ) {
                    this.averageIllumination = lightSensorChannel.averageIllumination;
                    this.platform.log.debug(
                        "Average light level of %s changed to %s lx",
                        this.accessory.displayName,
                        this.averageIllumination,
                    );
                    this.service.updateCharacteristic(
                        this.platform.Characteristic.CurrentAmbientLightLevel,
                        toHomeKitLightLevel(this.averageIllumination),
                    );
                }
            }
        }
    }
}
