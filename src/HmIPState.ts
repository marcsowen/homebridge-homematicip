
export interface HmIPDeviceChangeEvent {
    pushEventType: string;
    device: HmIPDevice;
}

export interface HmIPStateChangeEvent {
    pushEventType: string;
}

export interface HmIPStateChange {
    events: { [key: string]: HmIPStateChangeEvent }
}

export interface HmIPFunctionalChannel {
    functionalChannelType: string;
}

export interface HmIPDevice {
    id: string;
    label: string;
    type: string;
    oem: string;
    modelType: string
    firmwareVersion: string;
    functionalChannels: { [key: string]: HmIPFunctionalChannel };
}

export interface HmIPGroup {
    id: string;
    type: string;
}

export interface HmIPState {
    devices: { [key: string]: HmIPDevice };
    groups: { [key: string]: HmIPGroup }
}

export interface Updateable {
    updateDevice(device: HmIPDevice, groups: { [key: string]: HmIPGroup }): void;
}
