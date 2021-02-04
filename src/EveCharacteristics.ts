import {Characteristic, Formats, Perms} from 'hap-nodejs';

export class ElectricPower extends Characteristic {

  static readonly UUID: string = 'E863F10D-079E-48FF-8F27-9C2605A29F52';

  constructor() {
    super('Electric Power', ElectricPower.UUID);
    this.setProps({
      format: Formats.UINT16,
      perms: [Perms.NOTIFY, Perms.PAIRED_READ],
      maxValue: 100000,
      minValue: 0,
      minStep: 1,
    });
    this.value = this.getDefaultValue();
  }
}

export class ElectricalEnergy extends Characteristic {

  static readonly UUID: string = 'E863F10C-079E-48FF-8F27-9C2605A29F52';

  constructor() {
    super('Energy', ElectricalEnergy.UUID);
    this.setProps({
      format: Formats.FLOAT,
      perms: [Perms.NOTIFY, Perms.PAIRED_READ],
    });
    this.value = this.getDefaultValue();
  }
}
