import {
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    PlatformAccessory,
    Service
} from 'homebridge';

import {HmIPPlatform} from '../HmIPPlatform';
import {HmIPDevice, HmIPGroup, HmIPHome, HmIPLocation, HmIPWeather, Updateable} from "../HmIPState";
import {HmIPGenericDevice} from "./HmIPGenericDevice";

/**
 * HomematicIP Weather Device
 */
export class HmIPWeatherDevice extends HmIPGenericDevice implements Updateable {

    private readonly temperatureService: Service;

    private weather: HmIPWeather | null = null;
    private location: HmIPLocation | null = null;

    constructor(
        platform: HmIPPlatform,
        home: HmIPHome,
        accessory: PlatformAccessory
    ) {
        super(platform, home, accessory);

        this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor)!;

        this.updateDevice(home, accessory.context.device, platform.groups);

        this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .on('get', this.handleCurrentTemperatureGet.bind(this));

    }

    handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
        callback(null, this.weather?.temperature || 0);
    }

    updateDevice(hmIPHome: HmIPHome, hmIPDevice: HmIPDevice, groups: { [key: string]: HmIPGroup }): void {
        this.home = hmIPHome;
        if (hmIPHome) {
            if (hmIPHome.weather != this.weather) {
                this.weather = hmIPHome.weather;
                this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.weather.temperature);
            }
        }
    }

}
