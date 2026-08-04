import type {API, Logger} from 'homebridge';
import type {IdentifiableDevice} from 'homematicip-cloud-client-ts';
import {HmIPAccessory} from './HmIPAccessory.js';
import type {HmIPDeviceConfig} from './HmIPConfig.js';
import {sanitizeHomeKitName} from './HmIPName.js';
import type {HmIPPlatformAccessory} from './HmIPTypes.js';
import {PLATFORM_NAME, PLUGIN_NAME} from './settings.js';

interface AccessoryEntry {
  accessory: HmIPPlatformAccessory<IdentifiableDevice>;
  persisted: boolean;
}

function hasLabel(value: IdentifiableDevice): value is IdentifiableDevice & {label: string} {
  return 'label' in value && typeof value.label === 'string';
}

export class HmIPAccessoryRepository {
  private readonly entries = new Map<string, AccessoryEntry>();

  public constructor(
    private readonly api: API,
    private readonly log: Logger,
    private readonly deviceConfigs: Readonly<Record<string, HmIPDeviceConfig>> | undefined,
  ) {}

  public restore(accessory: HmIPPlatformAccessory<IdentifiableDevice>): boolean {
    if (this.entries.has(accessory.UUID)) {
      return false;
    }
    this.entries.set(accessory.UUID, {accessory, persisted: true});
    return true;
  }

  public acquire<T extends IdentifiableDevice>(
    uuid: string,
    displayName: string,
    context: T,
  ): HmIPAccessory<T> {
    const entry = this.entries.get(uuid);
    const accessory = entry
      ? entry.accessory as HmIPPlatformAccessory<T>
      : new this.api.platformAccessory<HmIPPlatformAccessory<T>['context']>(sanitizeHomeKitName(displayName), uuid);

    if (entry) {
      this.repairInvalidNames(accessory);
    }

    if (!entry) {
      this.entries.set(uuid, {
        accessory: accessory as HmIPPlatformAccessory<IdentifiableDevice>,
        persisted: false,
      });
    }

    const existingContext = accessory.context.device;
    // A restored accessory may have been renamed independently in HomeKit. Keep the
    // label that was used when it was created instead of treating an HmIP rename as
    // an instruction to rename the existing HomeKit accessory and its services.
    accessory.context.device = entry?.persisted === true && existingContext
      && hasLabel(existingContext) && hasLabel(context)
      ? {...context, label: existingContext.label}
      : context;
    const deviceConfig = this.deviceConfigs?.[context.id];
    if (deviceConfig) {
      accessory.context.config = deviceConfig;
    } else {
      delete accessory.context.config;
    }

    return new HmIPAccessory(this.api, this.log, accessory, entry?.persisted === true);
  }

  private repairInvalidNames<T extends IdentifiableDevice>(accessory: HmIPPlatformAccessory<T>): void {
    const safeAccessoryName = sanitizeHomeKitName(accessory.displayName);
    if (safeAccessoryName !== accessory.displayName) {
      accessory.displayName = safeAccessoryName;
      accessory.getService(this.api.hap.Service.AccessoryInformation)
        ?.updateCharacteristic(this.api.hap.Characteristic.Name, safeAccessoryName);
    }

    for (const service of accessory.services) {
      const safeServiceName = sanitizeHomeKitName(service.displayName, safeAccessoryName);
      if (safeServiceName !== service.displayName) {
        service.displayName = safeServiceName;
        service.updateCharacteristic(this.api.hap.Characteristic.Name, safeServiceName);
      }
    }
  }

  public register(accessory: HmIPAccessory): void {
    accessory.register();
    const entry = this.entries.get(accessory.accessory.UUID);
    if (entry) {
      entry.persisted = true;
    }
  }

  public remove(uuid: string): boolean {
    const entry = this.entries.get(uuid);
    if (!entry) {
      return false;
    }
    if (entry.persisted) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [entry.accessory]);
    }
    this.entries.delete(uuid);
    return true;
  }

  public reconcile(activeUuids: ReadonlySet<string>): void {
    for (const [uuid, entry] of this.entries) {
      if (!activeUuids.has(uuid)) {
        this.log.info('Removing accessory %s', entry.accessory.displayName);
        this.remove(uuid);
      }
    }
  }

  public get(uuid: string): HmIPPlatformAccessory<IdentifiableDevice> | undefined {
    return this.entries.get(uuid)?.accessory;
  }

  public get size(): number {
    return this.entries.size;
  }
}
