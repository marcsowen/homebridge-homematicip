import {API, Characteristic, CharacteristicProps, Formats, Units, Perms, WithUUID} from 'homebridge';

export class CustomCharacteristic {

  private api: API;
  public characteristic: { [key: string]: WithUUID< { new(): Characteristic }> } = {};

  constructor(api: API) {
    this.api = api;

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
