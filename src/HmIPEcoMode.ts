import type {CharacteristicValue, Service} from "homebridge";
import {type HmIPFunctionalHome, type HmIPHome, isHmIPRecord} from "homematicip-cloud-client-ts";
import {connectedGet, connectedSet} from "./HmIPAvailability.js";
import {getDeviceConfig} from "./HmIPConfig.js";
import type {HmIPPlatform} from "./HmIPPlatform.js";
import type {HmIPPlatformAccessory} from "./HmIPTypes.js";

const ECO_ABSENCE_TYPES: ReadonlySet<unknown> = new Set(["PERIOD", "PERMANENT"]);

const ECO_DURATION_MINUTES: ReadonlyMap<string, number> = new Map([
    ["ONE", 60],
    ["TWO", 120],
    ["FOUR", 240],
    ["SIX", 360],
]);

interface HmIPIndoorClimateSolution extends HmIPFunctionalHome {
    solution: "INDOOR_CLIMATE";
    absenceType?: string;
    ecoDuration?: string;
}

function isHmIPIndoorClimateSolution(functionalHome: HmIPFunctionalHome): functionalHome is HmIPIndoorClimateSolution {
    const candidate: unknown = functionalHome;
    return (
        isHmIPRecord(candidate) &&
        candidate.solution === "INDOOR_CLIMATE" &&
        candidate.active === true &&
        (candidate.absenceType === undefined || typeof candidate.absenceType === "string") &&
        (candidate.ecoDuration === undefined || typeof candidate.ecoDuration === "string")
    );
}

export function getHmIPIndoorClimateSolution(home: HmIPHome): HmIPIndoorClimateSolution | undefined {
    return Object.values(home.functionalHomes).find(isHmIPIndoorClimateSolution);
}

/**
 * HomematicIP eco mode of the whole home, using the rooms, temperature and duration configured in the Homematic IP app
 */
export class HmIPEcoMode {
    private service: Service;

    public hidden = false;
    private active = false;
    private ecoDuration: string | undefined;

    constructor(
        protected platform: HmIPPlatform,
        protected accessory: HmIPPlatformAccessory<HmIPHome>,
    ) {
        this.hidden =
            platform.config.hideEcoMode === true ||
            getDeviceConfig(platform.config.devices, "HOME_ECO_MODE")?.hide === true;

        this.platform.log.debug("Created eco mode switch");
        const home = accessory.context.device;

        this.accessory
            .getService(this.platform.Service.AccessoryInformation)
            ?.setCharacteristic(this.platform.Characteristic.Manufacturer, "eq-3")
            .setCharacteristic(this.platform.Characteristic.Model, "Eco Mode")
            .setCharacteristic(this.platform.Characteristic.SerialNumber, home.id)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, home.currentAPVersion);

        this.service =
            this.accessory.getService(this.platform.Service.Switch) ||
            this.accessory.addService(this.platform.Service.Switch, accessory.displayName);

        this.updateHome(home);

        this.service
            .getCharacteristic(this.platform.Characteristic.On)
            .onGet(connectedGet(this.platform, () => this.active))
            .onSet(connectedSet(this.platform, (value) => this.handleOnSet(value)));
    }

    private async handleOnSet(value: CharacteristicValue): Promise<void> {
        if (value !== true) {
            this.platform.log.info("Deactivating eco mode");
            await this.platform.connector.apiCall("home/heating/deactivateAbsence", {});
            return;
        }

        const duration = this.ecoDuration === undefined ? undefined : ECO_DURATION_MINUTES.get(this.ecoDuration);
        if (this.ecoDuration === "PERMANENT") {
            this.platform.log.info("Activating eco mode permanently");
            await this.platform.connector.apiCall("home/heating/activateAbsencePermanent", {});
        } else if (duration !== undefined) {
            this.platform.log.info("Activating eco mode for %d minutes", duration);
            await this.platform.connector.apiCall("home/heating/activateAbsenceWithDuration", {duration});
        } else {
            throw new Error("Cannot activate eco mode: select a supported eco duration in the Homematic IP app.");
        }
    }

    public updateHome(home: HmIPHome) {
        const indoorClimate = getHmIPIndoorClimateSolution(home);
        if (!indoorClimate) {
            return;
        }
        this.accessory.context.device = home;
        this.ecoDuration = indoorClimate.ecoDuration;
        const active = ECO_ABSENCE_TYPES.has(indoorClimate.absenceType);
        if (active !== this.active) {
            this.active = active;
            this.platform.log.info("Eco mode changed to %s", active ? "active" : "inactive");
        }
        // Also reset restored HomeKit state when the initial cloud state is inactive.
        this.service.updateCharacteristic(this.platform.Characteristic.On, active);
    }
}
