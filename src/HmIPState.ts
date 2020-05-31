
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

export interface HmIPState {
    devices: { [key: string]: HmIPDevice };
}