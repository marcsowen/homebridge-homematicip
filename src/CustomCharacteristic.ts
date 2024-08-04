import {API, Characteristic, CharacteristicProps, Formats, Units, Perms, WithUUID} from 'homebridge';

export class CustomCharacteristic {

  private api: API;
  public characteristic: { [key: string]: WithUUID< { new(): Characteristic }> } = {};

  constructor(api: API) {
    this.api = api;

    this.createCharacteristics('OpticalSignal', 'A11C14A7-BB9B-4085-8597-68CF63964BF8', {
      format: Formats.STRING,
      perms: [Perms.PAIRED_WRITE, Perms.PAIRED_READ, Perms.NOTIFY]
    }, 'Optical Signal Behaviour');

    this.createCharacteristics('ElectricPower', 'E863F10D-079E-48FF-8F27-9C2605A29F52', {
      format: Formats.FLOAT,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    }, 'Electric Power');

    this.createCharacteristics('ElectricalEnergy', 'E863F10C-079E-48FF-8F27-9C2605A29F52', {
      format: Formats.FLOAT,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    }, 'Electrical Energy');

    this.createCharacteristics('ValvePosition', 'E863F12E-079E-48FF-8F27-9C2605A29F52', {
      format: Formats.UINT8,
      unit: Units.PERCENTAGE,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      minValue: 0,
      maxValue: 100
    }, 'Valve Position');

    this.createCharacteristics('RainBool', 'F14EB1AD-E000-4EF4-A54F-0CF07B2E7BE7', {
      format: Formats.BOOL,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    });

    this.createCharacteristics('RainDay', 'CCC04890-565B-4376-B39A-3113341D9E0F', {
      format: Formats.FLOAT,
      unit: 'mm',
      minValue: 0,
      maxValue: 500,
      minStep: 0.1,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    });

    this.createCharacteristics('WindDirection', '46F1284C-1912-421B-82F5-EB75008B167E', {
      format: Formats.STRING,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    });

    this.createCharacteristics('WindSpeed', '49C8AE5A-A3A5-41AB-BF1F-12D5654F9F41', {
      unit: 'km/h',
      format: Formats.UINT8,
      minValue: 0,
      minStep: 0.1,
      maxValue: 100,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    });

    this.createCharacteristics('WeatherConditionCategory', 'CD65A9AB-85AD-494A-B2BD-2F380084134C', {
      format: Formats.UINT16,
      minValue: 0,
      minStep: 1,
      maxValue: 100,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    });
  }

  private createCharacteristics(key: string, uuid: string, props: CharacteristicProps, displayName: string = key) {
    this.characteristic[key] = class extends this.api.hap.Characteristic {
      static readonly UUID: string = uuid;

      constructor() {
        super(displayName, uuid, props);
        this.value = this.getDefaultValue();
      }
    }
  }

}
