import {API, Characteristic, CharacteristicProps, Formats, Units, Perms, WithUUID} from 'homebridge';

export class CustomCharacteristic {

  private api: API;
  public characteristic: { [key: string]: WithUUID< { new(): Characteristic }> } = {};

  constructor(api: API) {
    this.api = api;

    this.createCharacteristics('OpticalSignal', 'a11c14a7-bb9b-4085-8597-68cf63964bf8', {
      format: Formats.STRING,
      perms: [Perms.NOTIFY, Perms.PAIRED_WRITE, Perms.PAIRED_READ],
    });

    this.createCharacteristics('ElectricPower', 'E863F10D-079E-48FF-8F27-9C2605A29F52', {
      format: Formats.FLOAT,
      perms: [Perms.NOTIFY, Perms.PAIRED_READ],
    }, 'Electric Power');

    this.createCharacteristics('ElectricalEnergy', 'E863F10C-079E-48FF-8F27-9C2605A29F52', {
      format: Formats.FLOAT,
      perms: [Perms.NOTIFY, Perms.PAIRED_READ],
    }, 'Electrical Energy');

    this.createCharacteristics('ValvePosition', 'E863F12E-079E-48FF-8F27-9C2605A29F52', {
      format: Formats.UINT8,
      unit: Units.PERCENTAGE,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      minValue: 0,
      maxValue: 100
    }, 'Valve Position')

    this.createCharacteristics('RainBool', 'F14EB1AD-E000-4EF4-A54F-0CF07B2E7BE7', {
      format: Formats.BOOL,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    })

    this.createCharacteristics('RainDay', 'ccc04890-565b-4376-b39a-3113341d9e0f', {
      format: Formats.FLOAT,
      unit: 'mm',
      minValue: 0,
      maxValue: 500,
      minStep: 0.1,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    })

    this.createCharacteristics('WindDirection', '46f1284c-1912-421b-82f5-eb75008b167e', {
      format: Formats.STRING,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    })

    this.createCharacteristics('WindSpeed', '49C8AE5A-A3A5-41AB-BF1F-12D5654F9F41', {
      unit: 'km/h',
      format: Formats.UINT8,
      minValue: 0,
      minStep: 0.1,
      maxValue: 100,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    })

    this.createCharacteristics('WeatherConditionCategory', 'CD65A9AB-85AD-494A-B2BD-2F380084134C', {
      format: Formats.UINT16,
      minValue: 0,
      minStep: 1,
      maxValue: 100,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY]
    })
  }

  private createCharacteristics(key: string, uuid: string, props: CharacteristicProps, displayName: string = key) {
    this.characteristic[key] = class extends this.api.hap.Characteristic {
      static readonly UUID: string = uuid;

      constructor() {
        super(displayName, uuid, props);
        this.value = this.getDefaultValue();
      }
    };
  }

}
