import type {Characteristic} from "homebridge";
import type {HmIPPlatform} from "./HmIPPlatform.js";

function assertAvailable(platform: HmIPPlatform): void {
    if (platform.connectionReady === false) {
        throw new platform.api.hap.HapStatusError(platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
}

export function connectedGet(
    platform: HmIPPlatform,
    handler: Parameters<Characteristic["onGet"]>[0],
): Parameters<Characteristic["onGet"]>[0] {
    return (...args) => {
        assertAvailable(platform);
        return handler(...args);
    };
}

export function connectedSet(
    platform: HmIPPlatform,
    handler: Parameters<Characteristic["onSet"]>[0],
): Parameters<Characteristic["onSet"]>[0] {
    return (...args) => {
        assertAvailable(platform);
        return handler(...args);
    };
}
