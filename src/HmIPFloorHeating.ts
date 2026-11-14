import {type HmIPDevice, hasFunctionalChannelType, isHmIPRecord} from "homematicip-cloud-client-ts";

/**
 * Floor heating controllers (HmIP-FALMOT-C12, HmIP-FAL...) have no HomeKit accessory of their own.
 * Their valve positions are published through the wall thermostat of the room they heat.
 */
export function isHmIPFloorHeatingDevice(device: Pick<HmIPDevice, "type">): boolean {
    return typeof device.type === "string" && device.type.startsWith("FLOOR_TERMINAL_BLOCK");
}

/**
 * Returns the valve position (0..1) per heating group as reported by the floor heating controllers.
 * A room served by several heating circuits reports the highest position.
 *
 * The cloud does not fill `valvePosition` of the heating group for these controllers; the value only
 * exists on the controller's mechanic channels, which reference the heating group they belong to.
 */
export function getHmIPFloorHeatingValvePositions(devices: Readonly<Record<string, HmIPDevice>>): Map<string, number> {
    const valvePositions = new Map<string, number>();
    for (const device of Object.values(devices)) {
        if (!isHmIPFloorHeatingDevice(device) || !isHmIPRecord(device.functionalChannels)) {
            continue;
        }
        for (const channel of Object.values(device.functionalChannels)) {
            const candidate: unknown = channel;
            if (
                !isHmIPRecord(candidate) ||
                !hasFunctionalChannelType(channel, "FLOOR_TERMINAL_BLOCK_MECHANIC_CHANNEL") ||
                typeof candidate.valvePosition !== "number" ||
                !Number.isFinite(candidate.valvePosition) ||
                !Array.isArray(candidate.groups)
            ) {
                continue;
            }
            for (const groupId of candidate.groups) {
                if (typeof groupId === "string") {
                    valvePositions.set(groupId, Math.max(valvePositions.get(groupId) ?? 0, candidate.valvePosition));
                }
            }
        }
    }
    return valvePositions;
}
