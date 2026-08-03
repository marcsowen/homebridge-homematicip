# homebridge-homematicip

[![npm](https://img.shields.io/npm/v/homebridge-homematicip.svg?style=plastic)](https://www.npmjs.com/package/homebridge-homematicip)
[![npm](https://img.shields.io/npm/dt/homebridge-homematicip.svg?style=plastic)](https://www.npmjs.com/package/homebridge-homematicip)
[![GitHub last commit](https://img.shields.io/github/last-commit/marcsowen/homebridge-homematicip.svg?style=plastic)](https://github.com/marcsowen/homebridge-homematicip)
![GitHub build](https://img.shields.io/github/actions/workflow/status/marcsowen/homebridge-homematicip/main.yml?style=plastic)

## Bring Homematic IP devices into Apple Home

This Homebridge plugin makes a wide range of Homematic IP devices available in HomeKit and the Apple Home app.
Supported devices include thermostats, switches, dimmers, shutters and blinds, locks, contact and motion sensors,
smoke and water detectors, weather sensors, buttons, and security systems.

The plugin discovers supported devices connected to one or more Homematic IP Access Points, creates native HomeKit
accessories for them, and keeps their state synchronized continuously. Devices can be controlled from Apple Home,
included in scenes and automations, and used through Siri.

### Requirements

- Homebridge 2.2.x
- Node.js 22 or 24

Older Homebridge and Node.js releases are no longer supported by version 2.x of this plugin.
Existing `access_point`, `auth_token`, and per-device configuration remains compatible when upgrading from version 1.x.

### Installation

If you do not yet have Homebridge, follow the
[official Homebridge installation documentation](https://github.com/homebridge/homebridge/wiki).

The recommended way to install this plugin is through the Homebridge UI:

1. Open **Plugins** in the Homebridge UI.
2. Search for `homebridge-homematicip`.
3. Select **Install**.
4. Open the plugin settings to configure your Homematic IP Access Point.

The [Homebridge UI project](https://github.com/homebridge/homebridge-config-ui-x) provides additional installation and
plugin-management documentation.

### Configuration

The Homebridge UI exposes the available platform and per-device settings. You can also configure the plugin manually in
`config.json`. Add one configuration entry for each Homematic IP Access Point you want to expose.

#### Using an existing auth token

Configure the Access Point ID and authentication token:

```json
{
    "platform": "HomematicIP",
    "name": "HomematicIP",
    "access_point": "<your access point ID>",
    "auth_token": "<your API auth token>"
}
```

The Access Point ID is printed on the back of your Homematic IP Access Point (HmIP-HAP) and is
labeled as "SGTIN", e.g. 3014-xxxx-xxxx-xxxx-xxxx-xxxx.

#### Pairing without an auth token

If you do not have an authentication token yet, configure the Access Point ID without `auth_token`. Add `pin` only when
a PIN is configured in the Homematic IP app:

```json
{
    "platform": "HomematicIP",
    "name": "HomematicIP",
    "access_point": "<your access point ID>",
    "pin": "<your PIN if set in the app>"
}
```

After startup, wait for "Press blue, glowing link button of HmIP Access Point now!", then press the button. Copy the
generated token from the log into `config.json`, remove `pin`, and restart Homebridge.

A pairing attempt waits for the Access Point button for up to five minutes. It stops earlier when the cloud connection
fails. Restart Homebridge to begin another pairing attempt.

#### Additional options

See the [plugin wiki](https://github.com/marcsowen/homebridge-homematicip/wiki) for additional configuration details.

### Accessory synchronization

Devices added to or removed from the Homematic IP installation are reflected in Homebridge while the plugin is running.
Cached accessories that no longer exist are removed during startup.

Firmware revisions are updated in Homebridge when Homematic IP reports a change. Renaming a device in the Homematic IP
app does not overwrite an accessory name customized in Apple Home.


## Currently supported devices

- HmIP-HAP Access point
- HmIP-eTRV Radiator thermostat
- HmIP-eTRV-2 Radiator thermostat
- HmIP-eTRV-B Radiator thermostat - basic
- HmIP-eTRV-C Heating thermostat - compact without display
- HmIP-eTRV-CL Heating thermostat - compact plus with display
- HmIP-eTRV-E Radiator thermostat - Evo
- HmIP-eTRV-3 Radiator thermostat - pure
- HmIP-eTRV-F Radiator thermostat - flex
- HmIP-FROLL Shutter actuator - flush-mount
- HmIP-BROLL Shutter actuator - brand-mount
- HmIP-FBL Blind actuator - flush-mount
- HmIP-BBL Blind actuator - brand-mount
- HmIP-HDM1 Hunter Douglas and erfal window covering module
- HmIP-WTH Wall thermostat
- HmIP-WTH-2 Wall thermostat with humidity sensor
- HmIP-BWTH Brand wall thermostat with humidity sensor
- HmIP-WTH-B Wall thermostat – basic
- ALPHA-IP-RBG Alpha IP wall thermostat display
- HmIP-STH Temperature and humidity sensor without display - indoor
- HmIP-STHD Temperature and humidity sensor with display - indoor
- HmIP-SWDO Door / window contact - optical
- HmIP-SWDO-I Door / window contact - optical, invisible
- HmIP-SWDO-PL Door / window contact – optical, plus
- HmIP-SWDM / HMIP-SWDM-B2 Door / window Contact - magnetic
- HmIP-SCI Contact interface sensor
- HmIP-FCI1 / HmIP-FCI6 Contact interfaces - flush-mount, 1/6 channels
- HmIP-SRH Rotary handle switch
- HmIP-SWSD Smoke detector
- HmIP-PS / HmIP-PS-2 Pluggable switch
- HmIP-PCBS Switch circuit board - 1 channel
- HmIP-PCBS-BAT Printed circuit board switch battery
- HmIP-PCBS2 Switch circuit board - 2x channels
- HmIP-MOD-OC8 Open collector module
- HmIP-WHS2 Switch actuator for heating systems – 2x channels
- HmIPW-DRS8 Wired switch actuator – 8x channels
- HmIPW-DRS4 Wired switch actuator – 4x channels
- HmIP-BS2 Brand switch - 2x channels
- HmIP-DRSI4 Switch actuator for DIN rail mount – 4x channels
- HmIP-DRSI1 Switch actuator for DIN rail mount – 1 channel
- ELV-SH-SB8 Status board – 8x channels
- HmIPW-FIO6 Wired input/output module – 6x channels
- HmIP-MIOB Multi IO box
- HmIP-PSM Pluggable switch and meter
- HmIP-BSM Brand switch and meter
- HmIP-FSM, HmIP-FSM16 Full flush switch and meter
- HmIP-PSMCO Switch measuring cable – outdoor
- ELV-SH-PSMCI Switch measuring cable – indoor
- HmIP-USBSM USB switch and meter
- HmIP-FSI16 full flush switch (16A)
- HmIP-SCTH230 CO₂ sensor with switching output
- HmIP-SMO230 Outdoor motion detector with switching output
- HmIP-MOD-TM Garage door module - Tormatic
- HmIP-MOD-HO Garage door module - Hörmann
- HmIP-WGC Wall mounted garage door controller
- HmIP-SWD Water sensor
- HmIP-SLO Light sensor outdoor
- HmIP-SMI Motion detector with brightness sensor - indoor
- HmIP-SMO-A Motion detector with brightness sensor - outdoor
- HmIP-SMI55 Motion detector with brightness sensor and remote control - 2-button
- HmIP-SPI Presence sensor - indoor
- HmIP-PDT Pluggable dimmer
- HmIP-BDT Brand dimmer
- HmIP-FDT Dimming actuator flush-mount
- HmIPW-DRD3 Wired dimming actuator – 3x channels
- HmIP-DRDI3 DIN rail dimming actuator – 3x channels
- HmIP-DLD Door lock drive [1]
- HmIP-DLS Door lock sensor
- HmIP-BSL Notification light switch
- HmIP-SWO-B Smart weather sensor - basic
- HmIP-SWO-PL Smart weather sensor - plus
- HmIP-SWO-PR Smart weather sensor - pro
- HMIP-WRC2 Homematic IP button - 2 channels
- HMIP-WRC6 Homematic IP button - 6 channels
- HmIP-WRC6-230 Homematic IP button - 6 channels, 230 V, with switching output
- HMIP-BRC2 Homematic IP brand button - 2 channels
- HMIP-WRCC2 Homematic IP flat button - 2 channels
- HmIPW-WRC2 / HmIPW-WRC6 Homematic IP Wired buttons - 2/6 channels
- HmIP-KRC4 / HmIP-KRC-K Homematic IP key-ring remote controls - 4 channels
- HmIP-RC8 / HmIP-MOD-RC8 Homematic IP remote controls - 8 channels
- HmIP-DBB Homematic IP doorbell button
- ELV-SH-CTH Smart temperature and humidity sensor
- ELV-SH-SPS25 Switch power supply

[1] Please make sure homebridge-homematicip is added to the list of access control clients in HmIP app settings.

## TODOs

- Implement more devices
- Implement META-Group (Homematic IP rooms) to HomeKit room-Mapping
- Implement custom characteristics (Actuator) for Radiator Thermostats (e.g. to be used in Eve App)

## Development

This project uses pnpm and TypeScript 7:

```shell
pnpm install
pnpm run lint
pnpm run build
pnpm run test
```

### Shared client library

Cloud communication, pairing, state models, and response validation are provided by the reusable
[`homematicip-cloud-client-ts`](https://www.npmjs.com/package/homematicip-cloud-client-ts) package
([source](https://github.com/marcsowen/homematicip-cloud-client-ts)). It is installed automatically as a runtime
dependency; users do not need to install or configure it separately.

## Many thanks to our contributors

- @coreGreenberet for reverse-engineering and implementation of the first HomematicIP-API client using Python
  (https://github.com/coreGreenberet/homematicip-rest-api)
- @dmalch for adding fakegato-history support (https://github.com/simont77/fakegato-history)
- @smhex for HmIP-DLS, HmIP-BSL, HmIP-DRDI3, ELV-SH-CTH and ELV-SH-SPS25 support
- @ohueter for thermostat/climate sensor config option
- @aceg1k for improvements in thermostat heating/cooling state handling and API call handling
- @gkminix for HmIP-FSI16 support

## Help needed!
