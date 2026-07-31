import type {Logger} from 'homebridge';
import type {HmIPDevice, HmIPGroup, HmIPHome, HmIPState, HmIPStateChange} from './HmIPState.js';
import type {HmIPDeviceAdapter} from './HmIPTypes.js';

export interface HmIPEventRouterCallbacks {
  addDevice(device: HmIPDevice): void;
  removeDevice(deviceId: string, adapter: HmIPDeviceAdapter): void;
  updateHome(home: HmIPHome): void;
  updateSecurityGroups(groups: Readonly<Record<string, HmIPGroup>>): void;
}

export class HmIPEventRouter {
  public constructor(
    private readonly log: Logger,
    private readonly state: HmIPState,
    private readonly devices: Map<string, HmIPDeviceAdapter>,
    private readonly callbacks: HmIPEventRouterCallbacks,
  ) {}

  public handle(stateChange: HmIPStateChange): void {
    let securityZoneChanged = false;

    for (const event of Object.values(stateChange.events)) {
      switch (event.pushEventType) {
        case 'GROUP_CHANGED':
        case 'GROUP_ADDED':
          if (event.group) {
            this.log.debug(`${event.pushEventType}: ${event.group.id} ${JSON.stringify(event.group)}`);
            this.state.groups[event.group.id] = event.group;
            securityZoneChanged ||= event.group.type === 'SECURITY_ZONE';
          }
          break;
        case 'GROUP_REMOVED':
          if (event.group) {
            this.log.debug(`${event.pushEventType}: ${event.group.id}`);
            securityZoneChanged ||= event.group.type === 'SECURITY_ZONE';
            delete this.state.groups[event.group.id];
          }
          break;
        case 'DEVICE_REMOVED':
          if (event.device) {
            this.log.debug(`${event.pushEventType}: ${event.device.id} ${event.device.modelType}`);
            const adapter = this.devices.get(event.device.id);
            if (adapter) {
              this.callbacks.removeDevice(event.device.id, adapter);
            } else {
              this.log.debug(`Removal event from unregistered device: ${event.device.id}`);
            }
            delete this.state.devices[event.device.id];
          }
          break;
        case 'DEVICE_ADDED':
          if (event.device) {
            this.log.debug(`${event.pushEventType}: ${event.device.id} ${event.device.modelType}`);
            this.state.devices[event.device.id] = event.device;
            const adapter = this.devices.get(event.device.id);
            if (adapter) {
              adapter.updateDevice(event.device, this.state.groups);
            } else {
              this.callbacks.addDevice(event.device);
            }
          }
          break;
        case 'DEVICE_CHANGED':
          if (event.device) {
            this.log.debug(`${event.pushEventType}: ${event.device.id} ${event.device.modelType}`);
            this.state.devices[event.device.id] = event.device;
            const adapter = this.devices.get(event.device.id);
            if (adapter) {
              adapter.updateDevice(event.device, this.state.groups);
            } else {
              this.log.debug(`Change event from unregistered device: ${event.device.id}`);
            }
          }
          break;
        case 'DEVICE_CHANNEL_EVENT': {
          const adapter = this.devices.get(event.deviceId);
          if (adapter) {
            this.log.debug(`Channel Event: ${JSON.stringify(event)}`);
            adapter.channelEvent?.(event.channelIndex, event.channelEventType);
          } else {
            this.log.debug(`Device channel event from unregistered device: ${event.deviceId}`);
          }
          break;
        }
        case 'HOME_CHANGED':
          if (event.home) {
            this.log.debug(`${event.pushEventType}: ${event.home.id} ${JSON.stringify(event.home)}`);
            this.state.home = event.home;
            this.callbacks.updateHome(event.home);
          }
          break;
        case 'SECURITY_JOURNAL_CHANGED':
          this.log.debug(`${event.pushEventType}: ${JSON.stringify(event.data)}`);
          break;
        case 'UNKNOWN':
          this.log.debug(`Unhandled event type: ${event.sourcePushEventType} data=${JSON.stringify(event.data)}`);
          break;
        default: {
          const exhaustiveEvent: never = event;
          throw new Error(`Unhandled normalized event: ${JSON.stringify(exhaustiveEvent)}`);
        }
      }
    }

    if (securityZoneChanged) {
      this.callbacks.updateSecurityGroups(this.state.groups);
    }
  }
}
