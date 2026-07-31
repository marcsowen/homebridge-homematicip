import type {CharacteristicValue, Service} from 'homebridge';

import type {HmIPPlatform} from './HmIPPlatform.js';
import {
  type HmIPGroup,
  type HmIPHome,
  isHmIPSecurityAndAlarmSolution,
  isHmIPSecurityZoneGroup,
} from './HmIPState.js';
import type {HmIPPlatformAccessory} from './HmIPTypes.js';

const CLASSIC_SECURITY_ZONE_LABELS = {
  internal: 'INTERNAL',
  external: 'EXTERNAL',
} as const;

const REQUEST_BASED_SECURITY_ZONE_LABELS = {
  internal: 'ABSENCE',
  external: 'PRESENCE',
} as const;

type SecurityZoneLabels = typeof CLASSIC_SECURITY_ZONE_LABELS | typeof REQUEST_BASED_SECURITY_ZONE_LABELS;

class SecuritySystemTarget {
  public label: string;
  public internal: boolean;
  public external: boolean;

  constructor(label: string, internal: boolean, external: boolean) {
    this.label = label;
    this.internal = internal;
    this.external = external;
  }
}

/**
 * HomematicIP security system
 */
export class HmIPSecuritySystem {
  private service: Service;

  public hidden = false;
  private activationInProgress = false;
  private intrusionAlarmActive = false;
  private safetyAlarmActive = false;
  private alarmActive = false;
  private internalZoneActive = false;
  private externalZoneActive = false;
  private securityZoneLabels: SecurityZoneLabels = CLASSIC_SECURITY_ZONE_LABELS;

  constructor(
    protected platform: HmIPPlatform,
    protected accessory: HmIPPlatformAccessory<HmIPHome>,
  ) {
    this.hidden = platform.config.devices?.HOME_SECURITY_SYSTEM?.hide === true;

    this.platform.log.debug('Created security system');
    const home = accessory.context.device;

    this.accessory.getService(this.platform.Service.AccessoryInformation)?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'eq-3')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.displayName)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, home.id)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, home.currentAPVersion);

    this.service = this.accessory.getService(this.platform.Service.SecuritySystem)
      || this.accessory.addService(this.platform.Service.SecuritySystem);

    this.updateHome(home);

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .onGet(() => this.getSecuritySystemCurrentState());

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onGet(() => this.getSecuritySystemTargetState())
      .onSet(value => this.handleTargetStateSet(value));

  }

  private async handleTargetStateSet(value: CharacteristicValue): Promise<void> {
    const target = this.getSecuritySystemTarget(Number(value));
    if (!target) {
      throw new Error(`Unsupported security system target: ${value}`);
    }
    this.platform.log.info('Setting target security system state to %s', target.label);
    const body = {
      zonesActivation: {
        [this.securityZoneLabels.internal]: target.internal,
        [this.securityZoneLabels.external]: target.external,
      },
    };
    await this.platform.connector.command('home/security/setZonesActivation', body, 2);
  }

  public updateHome(home: HmIPHome) {
    for (const functionalHome of Object.values(home.functionalHomes)) {
      if (isHmIPSecurityAndAlarmSolution(functionalHome)) {
        this.platform.log.debug(`Security system update: ${JSON.stringify(functionalHome)}`);

        if (functionalHome.activationInProgress !== this.activationInProgress) {
          this.activationInProgress = functionalHome.activationInProgress;
          this.platform.log.info('Security system activation in progress changed to %s', this.activationInProgress);
        }

        if (functionalHome.intrusionAlarmActive !== this.intrusionAlarmActive) {
          this.intrusionAlarmActive = functionalHome.intrusionAlarmActive;
          this.platform.log.info('Security system intrusion alarm changed to %s', this.intrusionAlarmActive);
          this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemTargetState, this.getSecuritySystemTargetState());
          this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, this.getSecuritySystemCurrentState());
        }

        if (functionalHome.safetyAlarmActive !== this.safetyAlarmActive) {
          this.safetyAlarmActive = functionalHome.safetyAlarmActive;
          this.platform.log.info('Security system safety alarm changed to %s', this.safetyAlarmActive);
        }

        if (functionalHome.alarmActive !== this.alarmActive) {
          this.alarmActive = functionalHome.alarmActive;
          this.platform.log.info('Security system alarm changed to %s', this.alarmActive);
        }
      }
    }
  }

  public updateGroups(groups: Readonly<Record<string, HmIPGroup>>) {
    const securityZoneGroups = Object.values(groups).filter(isHmIPSecurityZoneGroup);
    const securityZoneLabels = securityZoneGroups.some(
      group => group.label === 'ABSENCE' || group.label === 'PRESENCE',
    )
      ? REQUEST_BASED_SECURITY_ZONE_LABELS
      : CLASSIC_SECURITY_ZONE_LABELS;

    if (securityZoneLabels !== this.securityZoneLabels) {
      this.securityZoneLabels = securityZoneLabels;
      this.platform.log.debug(
        'Security system uses %s and %s zone labels',
        securityZoneLabels.internal,
        securityZoneLabels.external,
      );
    }

    let stateChanged = false;

    for (const group of securityZoneGroups) {
      if (group.label === securityZoneLabels.internal) {
        if (group.active !== this.internalZoneActive) {
          this.internalZoneActive = group.active;
          this.platform.log.info('Security system activation status for internal zone changed to %s', this.internalZoneActive);
          stateChanged = true;
        }
      } else if (group.label === securityZoneLabels.external) {
        if (group.active !== this.externalZoneActive) {
          this.externalZoneActive = group.active;
          this.platform.log.info('Security system activation status for external zone changed to %s', this.externalZoneActive);
          stateChanged = true;
        }
      }
    }

    if (stateChanged) {
      this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemTargetState, this.getSecuritySystemTargetState());
      this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, this.getSecuritySystemCurrentState());
    }
  }

  private getSecuritySystemCurrentState(): number {
    if (this.intrusionAlarmActive) {
      return this.platform.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
    }

    if (this.externalZoneActive) {
      if (this.internalZoneActive) {
        return this.platform.Characteristic.SecuritySystemCurrentState.AWAY_ARM;
      } else {
        return this.platform.Characteristic.SecuritySystemCurrentState.STAY_ARM;
      }
    }

    return this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;
  }

  private getSecuritySystemTargetState(): number {
    if (this.externalZoneActive) {
      if (this.internalZoneActive) {
        return this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM;
      } else {
        return this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM;
      }
    }

    return this.platform.Characteristic.SecuritySystemTargetState.DISARM;
  }

  private getSecuritySystemTarget(state: number): SecuritySystemTarget | undefined {
    switch (state) {
      case this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM:
        return new SecuritySystemTarget('STAY_ARM', false, true);
      case this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM:
        return new SecuritySystemTarget('AWAY_ARM', true, true);
      case this.platform.Characteristic.SecuritySystemTargetState.NIGHT_ARM:
        return new SecuritySystemTarget('NIGHT_ARM', false, true);
      case this.platform.Characteristic.SecuritySystemTargetState.DISARM:
        return new SecuritySystemTarget('DISARM', false, false);
      default:
        return undefined;
    }
  }
}
