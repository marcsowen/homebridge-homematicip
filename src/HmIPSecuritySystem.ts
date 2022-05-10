import {CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HmIPPlatform} from './HmIPPlatform';
import {HmIPGroup, HmIPHome} from './HmIPState';

interface SecurityAndAlarmSolution {
  solution: string;
  active: boolean;
  activationInProgress: boolean;
  intrusionAlarmActive: boolean;
  safetyAlarmActive: boolean;
  alarmActive: boolean;
}

interface SecurityZoneGroup {
  id: string;
  type: string;
  label: string;
  active: boolean;
  silent: boolean;
  sabotage: boolean;
}

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

  constructor(
    protected platform: HmIPPlatform,
    protected accessory: PlatformAccessory,
  ) {
    this.hidden = platform.config['devices']?.['HOME_SECURITY_SYSTEM']?.['hide'] === true;

    this.platform.log.debug('Created security system');
    const home = <HmIPHome>accessory.context.device;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'eq-3')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.displayName)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, home.id)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, home.currentAPVersion);

    this.service = this.accessory.getService(this.platform.Service.SecuritySystem)
      || this.accessory.addService(this.platform.Service.SecuritySystem);

    this.updateHome(home);

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .on('get', this.handleCurrentStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .on('get', this.handleTargetStateGet.bind(this))
      .on('set', this.handleTargetStateSet.bind(this));

  }

  handleCurrentStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.getSecuritySystemCurrentState());
  }

  handleTargetStateGet(callback: CharacteristicGetCallback) {
    callback(null, this.getSecuritySystemTargetState());
  }

  async handleTargetStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const target = this.getSecuritySystemTarget(<number>value);
    this.platform.log.info('Setting target security system state to %s', target?.label);
    const body = {
      zonesActivation: {
        INTERNAL: target?.internal,
        EXTERNAL: target?.external,
      },
    };
    await this.platform.connector.apiCall('home/security/setZonesActivation', body);
    callback(null);
  }

  public updateHome(home: HmIPHome) {
    for (const id in home.functionalHomes) {
      const functionalHome = home.functionalHomes[id];
      if (functionalHome.solution === 'SECURITY_AND_ALARM') {
        const securitySolution = <SecurityAndAlarmSolution>functionalHome;
        this.platform.log.debug(`Security system update: ${JSON.stringify(securitySolution)}`);

        if (securitySolution.activationInProgress !== this.activationInProgress) {
          this.activationInProgress = securitySolution.activationInProgress;
          this.platform.log.info('Security system activation in progress changed to %s', this.activationInProgress);
        }

        if (securitySolution.intrusionAlarmActive !== this.intrusionAlarmActive) {
          this.intrusionAlarmActive = securitySolution.intrusionAlarmActive;
          this.platform.log.info('Security system intrusion alarm changed to %s', this.intrusionAlarmActive);
          this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemTargetState, this.getSecuritySystemTargetState());
          this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, this.getSecuritySystemCurrentState());
        }

        if (securitySolution.safetyAlarmActive !== this.safetyAlarmActive) {
          this.safetyAlarmActive = securitySolution.safetyAlarmActive;
          this.platform.log.info('Security system safety alarm changed to %s', this.safetyAlarmActive);
        }

        if (securitySolution.alarmActive !== this.alarmActive) {
          this.alarmActive = securitySolution.alarmActive;
          this.platform.log.info('Security system alarm changed to %s', this.alarmActive);
        }
      }
    }
  }

  public updateGroups(groups: {[key: string]: HmIPGroup}) {
    let stateChanged = false;

    for (const groupKey in groups) {
      const group = groups[groupKey];
      if (group.type === 'SECURITY_ZONE') {
        const securityGroup = <SecurityZoneGroup>group;

        if (securityGroup.label === 'INTERNAL') {
          if (securityGroup.active !== this.internalZoneActive) {
            this.internalZoneActive = securityGroup.active;
            this.platform.log.info('Security system activation status for internal zone changed to %s', this.internalZoneActive);
            stateChanged = true;
          }
        } else if (securityGroup.label === 'EXTERNAL') {
          if (securityGroup.active !== this.externalZoneActive) {
            this.externalZoneActive = securityGroup.active;
            this.platform.log.info('Security system activation status for external zone changed to %s', this.externalZoneActive);
            stateChanged = true;
          }
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
    }
  }
}
