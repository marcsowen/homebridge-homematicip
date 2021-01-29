## 0.1.2 (2021-01-29)

### Improvements

- **General**: Automatically remove unsupported devices from cache

## 0.1.1 (2021-01-28)

### Improvements

- **GarageDoor**: Further optimized target door state by updating it asynchronously.

### Bug Fixes

- **WaterSensor**: Hopefully fixed "This callback function has already been called by someone else; it can only be
  called one time." bug. Removed humidity detector for now.
- **ClimateSensor**: Fixed a bug where outside temperatures below zero won't be accepted by HomeKit.

## 0.1.0 (2021-01-28)

### New devices

- **HmIP-SWD (Water sensor)**. The sensor exposes two services: Moisture detector and water level detector.

### Improvements

- **GarageDoor**: Display light state as ON/OFF instead of true/false
- **HomeControllerAccessPoint**: Removed the device completely. It was not useful anyway and confused people why there
  was still light burning in the house.
- **SmokeDetector**: Smoke alarm is only triggered when the device itself is detecting smoke. In this way the alarm
displayed on your device is showing the sensor where the smoke actually was detected, not all the smoke sensors in the 
  house.
  
### Bug Fixes

- **GarageDoor**: Fixes target door state update when OPEN/CLOSE was triggered by external app
- **SmokeDetector**: Removed erroneous tampered state detection when instead it was really a burglar alarm.