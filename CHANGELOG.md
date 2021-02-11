## 0.2.2 (2021-02-11)

### New devices

- **HmIP-SLO**: Light Sensor outdoor

### Improvements

- **General**: Added API call rate limiter to prevent 60 minutes IP blocks by eq-3 when using fast firing GUI elements
like the shutter slider in EVE app.
- **SwitchMeasuring**: Show power and energy with less decimal places.
- **Shutter/Blind**: Show shutter and slats level without decimal places.
- **General**: Minor code cleanup.

## 0.2.1 (2021-02-07)

### Improvements

- **WallMountedThermostat**: Added info log when changing target heating/cooling state or display unit. These changes 
  are ignored.

### Bug Fixes

- **General**: Fixed dependency problem preventing plugin to start.

## 0.2.0 (2021-02-04)

### Improvements

- **Switch**: Split switch device into switch and measuring switch device to expose more features.
- **SwitchMeasuring**: Added EVE characteristics ElectricPower and ElectricalEnergy for measuring switches. Those values
  can be viewed e.g. by using the EVE App on iOS.
- **General**: Code clean-up. Removed dozens of unused home references.
- **General**: Removed unused weather device.
- **WallMountedThermostat**: Target heating mode is now AUTO by default. Current heating mode depends on cooling state
of heating group.
  
## 0.1.5 (2021-02-02)

### Improvements

- **GarageDoor**: Introduced assumed target position. Enhanced state logic.

### Bug Fixes

- **Blind**: Set correct (current) shutter level when setting slats level. This should prevent the shutter from going
all the way up when changing slats level.

## 0.1.4 (2021-02-01)

### Improvements

- **GarageDoor**: Removed explicit target door position which is not known anyway. This might improve display
  of animation in Home App.

## 0.1.3 (2021-02-01)

### New devices

- **HmIP-FBL**: Blind Actuator - flush-mount
- **HmIP-BBL**: Blind Actuator - brand-mount

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