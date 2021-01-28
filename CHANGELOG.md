## 0.1.0 (2020-01-28)

### New devices

- **HmIP-SWD (Water sensor)**. The sensor exposes two services: Moisture detector and water level detector.

### Improvements

- **GarageDoor**: Display light state as ON/OFF instead of true/false
- **HomeControllerAccessPoint**: Removed device. It was not useful anyway and confused people why there was still light
burning in the house.
- **SmokeDetector**: Smoke alarm is only triggered when the device itself is detecting smoke. In this way the alarm
displayed on your device is showing the sensor where the smoke actually was detected, not all the smoke sensors in the 
  house.
  
### Bug Fixes

- **GarageDoor**: Fixes target door state update when OPEN/CLOSE was triggered by external app
- **SmokeDetector**: Removed erroneous tampered state detection when instead it was really a burglar alarm.