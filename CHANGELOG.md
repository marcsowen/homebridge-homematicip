## 0.4.2 (2021-03-23)

### Bugfix

- **Dimmer**: Fixed "flashing" of dimmer while changing dim level.

## 0.4.1 (2021-03-21)

### New devices

- **Dimmer**: Added dimmer devices: HmIP-PDT, HmIP-BDT, HmIP-FDT, HmIPW-DRD3

## 0.4.0 (2021-03-19)

### New devices

- **MotionDetector**: Added motion detector style devices: HmIP-SMI, HmIP-SMO-A, HmIP-SMI55
- **PresenceDetector**: Added presence detector: HmIP-SPI

## 0.3.7 (2021-03-13)

### Bugfix

- **General**: Fixed tampered state mapping.

## 0.3.6 (2021-03-13)

### Improvements

- **ContactSensor**: Added sabotage state (tampered state) for contact sensors which support it.

### Bugfix

- **General**: Fixed low battery display for all devices with sabotage channel.

## 0.3.5 (2021-03-13)

### Improvements

- **SmokeDetector**: Removed obsolete tampered characteristic.

## 0.3.4 (2021-03-13)

### Bugfix

- **General**: Prevent warning messages about missing characteristics.

## 0.3.3 (2021-03-13)

### Improvements

- **General**: Removed obsolete battery services and characteristics.

## 0.3.2 (2021-03-13)

### Improvements

- **ContactSensor**: Removed obsolete current door state characteristic.

## 0.3.1 (2021-03-13)

### Improvements

- **ContactSensor**: Removed additional "window" service which prevents display of two window sensors when there is only
  one.
- **RotaryHandleSensor**: Use window service for the rotary handle sensor exclusively. Removed contact service for this
  device.

## 0.3.0 (2021-02-28)

### New devices

- **SecuritySystem**: Added security system including internal and external alarm zones. This is definitely beta, so 
  please don't trust the alarm to go off inside HomeKit. Also check the HomematicIP app to be sure the right alarm
  setting is applied.

### Improvements

- **ContactSensor**: Added "window" service to contact sensor. The window service supports "tilted" windows by
  displaying a current position of 50%.
- **General**: Only add battery service if device actually has a battery.
- **General**: Removed now optional characteristics "battery level" and "charging state" which are not supported by
  HomematicIP anyway.

## 0.2.5 (2021-02-12)

### Improvements

- **Shutter/Blind**: Improved target position behavior even further. Now target always follows the current position. The
spinning progress indicator was actually spinning because current and target position were not the same.

## 0.2.4 (2021-02-12)

### Improvements

- **General**: Removed all push button type devices. I haven't figured out a way to get push events from the HmIP-Cloud.
My guess is it is not possible. Now those devices not shown as unsupported devices in the Home App.
  
## 0.2.3 (2021-02-12)

### New devices

- **HmIP-eTRV-C**: Heating-thermostat compact without display

### Improvements

- **HmIP-eTRV**: Fixed update of valve position. Show valve position changes in logs.
- **HmIP-eTRV**: Valve position > 0 indicates current cooling/heating state: HEAT. Valve position = 0 indicates current
  heating cooling/heating state: OFF.
- **HmIP-eTRV**: Added logs for setting ignored values (target cooling/heating mode, display units).
- **HmIP-eTRV**: Target cooling/heating mode is now ignored. Will be used for future mapping of custom states.
- **HmIP-eTRV**: Show changes of valve state in logs.

### Bugfix

- **Shutter/Blind**: Fixed spinning progress indicator in Home app.
- **HmIP-eTRV-C**: HmIP-eTRV-C was listed but not actually supported. 

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