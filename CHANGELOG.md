## 2.4.1 (2026-08-03)

### Bug fixes

- **Home Control Unit**: Accept HCU `PLUGIN_EXTERNAL` records without aborting startup and keep these unsupported plug-in devices hidden from HomeKit.
- **Diagnostics**: Invalid cloud responses now include field-specific, redacted diagnostics through `homematicip-cloud-client-ts` 0.2.1.
- **Dependencies**: Require `homematicip-cloud-client-ts` 0.2.1 or newer.

This release does not require any Homebridge configuration changes.

## 2.4.0 (2026-08-03)

### Improvements

- **Home Control Unit**: Added HmIP-HCU1 cloud connectivity and pairing support through `homematicip-cloud-client-ts` 0.2.x ([#575](https://github.com/marcsowen/homebridge-homematicip/issues/575)). The controller itself remains hidden while its compatible devices are exposed to HomeKit.
- **Dependencies**: Updated `homematicip-cloud-client-ts` from 0.1.x to 0.2.x.

This release does not require any Homebridge configuration changes.

## 2.3.0 (2026-08-03)

### Improvements

- **Client library**: Moved Homematic IP Cloud endpoint discovery, authentication, REST requests, WebSocket handling, state types, and response validation into the reusable [`homematicip-cloud-client-ts`](https://github.com/marcsowen/homematicip-cloud-client-ts) package.
- **Dependencies**: Replaced the plugin's direct `p-queue`, `ws`, and `@types/ws` dependencies with `homematicip-cloud-client-ts` 0.1.x.
- **Events**: Homebridge now consumes validated, typed state-change events from the shared client instead of parsing WebSocket payloads itself.

This release does not require any Homebridge configuration changes.

## 2.2.0 (2026-08-03)

### New devices

- **Thermostats**: Added HmIP-eTRV-F and HmIP-eTRV-3 radiator thermostats supported by the reference Homematic IP client ([#585](https://github.com/marcsowen/homebridge-homematicip/issues/585)).
- **Contact sensors**: Added HmIP-FCI1 and multichannel HmIP-FCI6 flush-mounted contact interface support ([#522](https://github.com/marcsowen/homebridge-homematicip/issues/522)).
- **Window coverings**: Added HmIP-HDM1 shading-module support. HmIP-HDM2 remains unverified pending an API state dump ([#521](https://github.com/marcsowen/homebridge-homematicip/issues/521)).

## 2.1.0 (2026-08-03)

### Bug fixes

- **Switches**: Expose only actuator output channels as HomeKit switches, preventing the HmIP-PS-2 input channel from appearing as a second, non-functional switch. Obsolete cached switch services are removed automatically.
- **Motion detectors**: Send illumination changes to the optional HomeKit light-sensor service instead of the motion-sensor service.
- **Thermostats**: Apply heating-group changes immediately and preserve the initial humidity reported by wall thermostats.

### New devices

- **Switches**: Added further switch-capable and switch-measuring device types supported by the reference Homematic IP client.
- **Buttons**: Added the HmIP-WRC6-230, wired wall controls, key-ring remotes, eight-button remotes, remote-control module, and doorbell button variants supported by the reference client ([#608](https://github.com/marcsowen/homebridge-homematicip/issues/608)).

### Improvements

- **Dimmers**: Added all-channel support for the HmIPW-DRD3 and consolidated ordinary and DIN-rail multichannel dimmers into one channel-aware implementation.
- **Accessories**: Initialize adapters only after construction and preserve names customized in HomeKit across all device services.

## 2.0.1 (2026-08-01)

### Bug fixes

- **API**: Accept external devices without an `oem` field and request-based security zones without an `active` field, matching the shapes handled by the reference Homematic IP client ([#604](https://github.com/marcsowen/homebridge-homematicip/issues/604)).

## 2.0.0 (2026-07-31)

### Breaking changes

- **General**: Homebridge 2.2 is now required. Node.js 22 and 24 are the supported Node.js releases ([#586](https://github.com/marcsowen/homebridge-homematicip/issues/586)).

### Improvements

- **Homebridge**: Migrated characteristic handlers to the promise-based API so failed device commands are reported back to HomeKit instead of being silently ignored.
- **Accessories**: Added live handling for devices added to or removed from the Homematic IP installation and reliable reconciliation of cached Homebridge accessories at startup.
- **Accessories**: Device firmware changes are now published to Homebridge immediately. Homematic IP device renames no longer overwrite names customized in Apple Home.
- **Connector**: Added validated API responses, request timeouts, cancellation, rate limiting, structured failure handling, and safer diagnostics.
- **Connector**: Added an explicit WebSocket lifecycle with heartbeat detection, stale-connection protection, bounded reconnect backoff, and clean shutdown.
- **Pairing**: Pairing now distinguishes a pending button press from connection failures and stops after five minutes instead of polling indefinitely.
- **Lifecycle**: Added idempotent platform startup and shutdown, including cleanup of active requests, WebSockets, reconnect timers, and device history timers.
- **Configuration**: Added typed configuration and accessory contexts together with a Homebridge settings schema for platform and per-device options ([#524](https://github.com/marcsowen/homebridge-homematicip/issues/524)).
- **General**: Upgraded the project to TypeScript 7 and modern Node.js APIs, enabled stricter compiler checks, and added focused tests for API, WebSocket, event-routing, accessory-cache, and firmware behavior.
- **General**: Upgraded maintained dependencies, replaced the unmaintained request limiter, removed obsolete runtime polyfills, and modernized linting and CI for Node.js 22 and 24.

### Bug fixes

- **SecuritySystem**: Added support for the `ABSENCE` and `PRESENCE` zone labels used by request-based alarm configurations, preventing HTTP 400 errors when changing the security state ([#603](https://github.com/marcsowen/homebridge-homematicip/issues/603)).
- **Events**: Fixed channel events with channel index `0` being treated as missing.
- **WebSocket**: Prevented duplicate reconnect attempts and ignored events arriving from obsolete sockets.
- **Accessories**: Prevented duplicate UUID registration and ensured dynamically removed or hidden accessories release their resources.
- **API**: Malformed JSON, invalid endpoint URLs, and incomplete Homematic IP state or event payloads are now rejected safely.

## 1.3.1 (2024-01-13)

### New devices

- **HmIP-DRDI3**: Added multichannel dimmer (@smhex)
- **HmIP-FSI16**: Added switch actor for 16A (@gkminix)

### Improvements

- **General**: Version bumps of dependencies

## 1.2.0 (2023-11-01)

### New devices

- **HmIP-SWO**: Added weather sensors: HmIP-SWO-B, HmIP-SWO-PL, HmIP-SWO-PR

### Improvements

- **Thermostats**: Added eve compatible valve position as custom characteristic
- **General**: Unified HmIPHeatingThermostat, HmIPWallMountedThermostat
- **General**: Fixed missing fakegato statistics
- **General**: Limited fakegato updates
- **General**: Version bumps of dependencies

### Bugfix

- **General**: Works with Node.js >= 20

## 1.0.1 (2022-09-05)

### Bugfix

- **Switches**: Fixed "characteristic was supplied illegal value: null"

## 1.1.0 (2022-10-12)

### Improvements

- **WallMountedThermostat**: Improved handling of heating/cooling state (@aceg1k)
- **WallMountedThermostat**: Guard against unnecessary API calls (@aceg1k)
- **API call limited**: Added reservoir and ability to prioritize API calls (@aceg1k)
- **General**: Version bumps of dependencies

## 1.0.1 (2022-09-05)

### Bugfix

- **Switches**: Fixed "characteristic was supplied illegal value: null"

## 1.0.0 (2022-08-31)

### New devices

- **HmIP-BLS**: Added support for HmIP-BLS door lock sensor (Many thanks to @smhex)

### Improvements

- **ClimateSensor**: Added switch to force a thermostat device to act as a climate sensor (Many thanks to @ohueter)
- **General**: It's time for version 1.0.0!
- **General**: Version bumps of dependencies.

## 0.8.0 (2022-05-11)

### New devices

- **HmIP-DLS**: Added support for HmIP-DLS door lock sensor (Many thanks to @smhex)

### Improvements

- **General**: Version bumps of dependencies.
- **General**: Switched to pnpm instead of npm.

### Bugfix

- **SecuritySystem**: Fixed erroneous state change within the home app.

## 0.7.2 (2021-12-29)

### Improvements

- **HmIP-MOD**: Added "lightSwitch" config option to disable light switch if not available.
- **General**: Reduced verbosity of log messages. Some frequent log messages have log level debug now.

### Bugfix

- **General**: Fixed removal of cached accessories which were removed from HmIP cloud.

## 0.7.1 (2021-12-21)

### Improvements

- **General**: Added per-device config. All devices can be hidden by setting config.json option "hidden": true. See
  [GitHub Wiki](https://github.com/marcsowen/homebridge-homematicip/wiki) for details.
- **HmIP-DLD**: New option "openLatch". When set to true, opening the lock will open the door completely by pulling
  the door latch.

### Bugfix

- **HmIP-DLD**: Lock target state was not always updated correctly displaying an opening/closing animation in Home app.

## 0.7.0 (2021-12-18)

### New devices

- **HmIP-DLD**: Added support for HmIP door lock drive - thanks to @adrianoje for borrowing me his HmIP-DLD!

### Improvements

- **General**: Version bumps of dependencies.

## 0.6.0 (2021-11-26)

### Improvements

- **Elgato EVE history service**: Support for graphical temperature/humidity plots when using EVE app. The history is 
  stored on the filesystem of the server running this plugin (e.g. your Raspberry Pi). Many thanks to @dmalch for 
  implementing this feature.
- **General**: Clean-up and version bumps.

## 0.5.2 (2021-10-07)

### New devices

- **HmIP-eTRV-E**: Added support for HmIP Thermostat "Evo" - thanks to Sven Liebert for adding support.

### Improvements

- **HmIPHeatingThermostat**: Extend min/max set temperature range to 5-30 degrees.

### Bugfix

- **General**: Version bumps for dependencies. I'm still using 3.0.0-beta9 of node-fetch since all projects need to
switch from "commonJS" to "ESM" starting from node-fetch 3.0.0. This caused problems for some users.
(https://github.com/marcsowen/homebridge-homematicip/issues/165) 

## 0.5.1 (2021-07-29)

### Bugfix

- **General**: Version bumps for dependencies. Solves an issue with node-fetch for newer installations.

## 0.5.0 (2021-05-15)

### Improvements

- **HmIP-STH/STHD**: Device is now a thermostat instead of a simple climate sensor. The target temperature is usually
  extracted from the device channel. In case of the HmIP-STH the target temperature is determined from the heating group
  since the device channel doesn't provide this kind of information.
- **General**: Log messages contain a unit symbol where applicable.
- **General**: Removed now long-running Hclean-up code for obsolete services and characteristics

## 0.4.3 (2021-03-23)

### Bugfix

- **Dimmer**: Fixed turning dimmer on with Siri.

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
