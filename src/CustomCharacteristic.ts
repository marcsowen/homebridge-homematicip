import {API, Characteristic, CharacteristicProps, Formats, Perms, WithUUID} from 'homebridge';

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
  }

  private createCharacteristics(key: string, uuid: string, props: Partial<CharacteristicProps>, displayName: string = key) {
    this.characteristic[key] = class extends this.api.hap.Characteristic {
      static readonly UUID: string = uuid;

      constructor() {
        super(displayName, uuid);
        this.setProps(props);
        this.value = this.getDefaultValue();
      }
    };
  }

}
