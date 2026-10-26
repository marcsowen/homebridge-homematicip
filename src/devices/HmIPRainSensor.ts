import type {Service} from "homebridge";
import {
    type HmIPDevice,
    type HmIPFunctionalChannel,
    type HmIPGroup,
    hasFunctionalChannelType,
    isHmIPRecord,
} from "homematicip-cloud-client-ts";
import {connectedGet} from "../HmIPAvailability.js";
import type {HmIPPlatform} from "../HmIPPlatform.js";
import type {HmIPPlatformAccessory} from "../HmIPTypes.js";
import {HmIPGenericDevice} from "./HmIPGenericDevice.js";

interface RainDetectionChannel extends HmIPFunctionalChannel {
    functionalChannelType: "RAIN_DETECTION_CHANNEL";
    rainSensorSensitivity?: number | null;
    raining: boolean | null;
}

function isRainDetectionChannel(channel: HmIPFunctionalChannel): channel is RainDetectionChannel {
    if (!hasFunctionalChannelType(channel, "RAIN_DETECTION_CHANNEL")) {
        return false;
    }
    const candidate: unknown = channel;
    return (
        isHmIPRecord(candidate) &&
        (candidate.raining === null || typeof candidate.raining === "boolean") &&
        (candidate.rainSensorSensitivity === undefined ||
            candidate.rainSensorSensitivity === null ||
            typeof candidate.rainSensorSensitivity === "number")
    );
}

/**
 * Homematic IP rain sensor
 *
 * HmIP-SRD
 */
export class HmIPRainSensor extends HmIPGenericDevice {
    private rainService?: Service;
    private raining = false;

    constructor(platform: HmIPPlatform, accessory: HmIPPlatformAccessory) {
        super(platform, accessory);

        const rainChannel = Object.values(accessory.context.device.functionalChannels).find(isRainDetectionChannel);
        if (!rainChannel) {
            this.rejectMissingFunctionalServices("RAIN_DETECTION_CHANNEL with boolean/null raining");
            return;
        }

        this.raining = rainChannel.raining ?? false;
        this.rainService = this.getOrAddService(this.platform.Service.OccupancySensor, accessory.context.device.label);
        this.rainService
            .getCharacteristic(this.platform.Characteristic.OccupancyDetected)
            .onGet(connectedGet(this.platform, () => this.getOccupancyState()));

        this.platform.log.debug(`Created rain sensor ${accessory.context.device.label}`);
    }

    public override updateDevice(hmIPDevice: HmIPDevice, groups: Readonly<Record<string, HmIPGroup>>): void {
        super.updateDevice(hmIPDevice, groups);
        const rainChannel = Object.values(hmIPDevice.functionalChannels).find(isRainDetectionChannel);
        if (!this.rainService || !rainChannel || rainChannel.raining === null || rainChannel.raining === this.raining) {
            return;
        }

        this.raining = rainChannel.raining;
        this.platform.log.info("Rain sensor %s changed raining=%s", this.accessory.displayName, this.raining);
        this.rainService.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.getOccupancyState());
    }

    private getOccupancyState(): number {
        return this.raining
            ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    }
}
