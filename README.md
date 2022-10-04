# homebridge-homematicip

[![npm](https://img.shields.io/npm/v/homebridge-homematicip.svg?style=plastic)](https://www.npmjs.com/package/homebridge-homematicip)
[![npm](https://img.shields.io/npm/dt/homebridge-homematicip.svg?style=plastic)](https://www.npmjs.com/package/homebridge-homematicip)
[![GitHub last commit](https://img.shields.io/github/last-commit/marcsowen/homebridge-homematicip.svg?style=plastic)](https://github.com/marcsowen/homebridge-homematicip)
![GitHub build](https://img.shields.io/github/workflow/status/marcsowen/homebridge-homematicip/Node.js%20CI/master?style=plastic)

## Homematic IP platform plugin for homebridge

Uses the unofficial HTTP API and WebSockets for continuous channel updates. 

Add one (or more) Homematic IP Access Points to config.json. There are two configuration
options that you can set:

```
{
    "platform": "HomematicIP",
    "name": "HomematicIP",
    "access_point": "<your access point ID>",
    "auth_token": "<your API auth token>"
}
```

The Access Point ID is printed on the back of your Homematic IP Access Point (HmIP-HAP) and is 
labeled as "SGTIN", e.g. 3014-xxxx-xxxx-xxxx-xxxx-xxxx. 

### Pairing 

```
{
    "platform": "HomematicIP",
    "name": "HomematicIP",
    "access_point": "<your access point ID>",
    "pin": "<your PIN if set in the app>"
}
```

If you do not have an auth_token or don't know it, leave it empty. Be sure to add the "pin" property if it is set in the app. 
After startup, watch the logs and wait for "Press blue, glowing link button of HmIP Access Point now!". Then press the
button and note the "auth_token" that is being generated, add it to your config.json, remove the pin and restart.

### Additional config

See [Wiki](https://github.com/marcsowen/homebridge-homematicip/wiki) for details.


## Currently supported devices

- HmIP-HAP (Access Point)
- HmIP-eTRV (Radiator Thermostat)
- HmIP-eTRV-2 (Radiator Thermostat)
- HmIP-eTRV-B (Radiator Thermostat - basic)
- HmIP-eTRV-C (Heating-thermostat - compact without display)
- HmIP-eTRV-E (Radiator Thermostat - Evo)
- HmIP-FROLL (Shutter Actuator - flush-mount)
- HmIP-BROLL (Shutter Actuator - brand-mount)
- HmIP-FBL (Blind Actuator - flush-mount)
- HmIP-BBL (Blind Actuator - brand-mount)
- HmIP-WTH (Wall Thermostat)
- HmIP-WTH-2 (Wall Thermostat with Humidity Sensor)
- HmIP-BWTH (Brand Wall Thermostat with Humidity Sensor)
- HmIP-WTH-B (Wall Thermostat – basic)
- ALPHA-IP-RBG (Alpha IP Wall Thermostat Display)
- HmIP-STH (Temperature and Humidity Sensor without display - indoor)
- HmIP-STHD (Temperature and Humidity Sensor with display - indoor)
- HmIP-SWDO (Door / Window Contact - optical)
- HmIP-SWDO-I (Door / Window Contact - optical, invisible)
- HmIP-SWDO-PL (Door / Window Contact – optical, plus)
- HmIP-SWDM / HMIP-SWDM-B2  (Door / Window Contact - magnetic)
- HmIP-SCI (Contact Interface Sensor)
- HmIP-SRH (Rotary handle switch)
- HmIP-SWSD (Smoke detector)
- HmIP-PS (Pluggable Switch)
- HmIP-PCBS (Switch Circuit Board - 1 channel)
- HmIP-PCBS-BAT (Printed Circuit Board Switch Battery)
- HmIP-PCBS2 (Switch Circuit Board - 2x channels) [1]
- HmIP-MOD-OC8 ( Open Collector Module ) [1]
- HmIP-WHS2 (Switch Actuator for heating systems – 2x channels) [1]
- HmIP-DRS8 (Homematic IP Wired Switch Actuator – 8x channels) [1]
- HmIP-DRSI4 (Homematic IP Switch Actuator for DIN rail mount – 4x channels) [1]
- HmIP-PSM (Pluggable Switch and Meter)
- HmIP-BSM (Brand Switch and Meter)
- HmIP-FSM, HmIP-FSM16 (Full flush Switch and Meter)
- HmIP-MOD-TM (Garage Door Module Tormatic)
- HmIP-MOD-HO (Garage Door Module for Hörmann)
- HmIP-SWD (Water sensor)
- HmIP-SLO (Light Sensor outdoor)
- HmIP-SMI (Motion Detector with Brightness Sensor - indoor)
- HmIP-SMO-A (Motion Detector with Brightness Sensor - outdoor)
- HmIP-SMI55 (Motion Detector with Brightness Sensor and Remote Control - 2-button)
- HmIP-SPI (Presence Sensor - indoor)
- HmIP-PDT Pluggable Dimmer
- HmIP-BDT Brand Dimmer
- HmIP-FDT Dimming Actuator flush-mount
- HmIPW-DRD3 (Homematic IP Wired Dimming Actuator – 3x channels) [1]
- HmIP-DLD Door lock drive [2]
- HmIP-DLS Door lock sensor
- HmIP-BSL Notification light switch

[1] Currently, only first channel is supported.<br>
[2] Please make sure homebridge-homematicip is added to the list of access control clients in HmIP app settings.

## TODOs

- Implement more devices
- Implement META-Group (Homematic IP rooms) to HomeKit room-Mapping
- Implement custom characteristics (Actuator) for Radiator Thermostats (e.g. to be used in Eve App) 

## Many thanks to our contributors

- @coreGreenberet for reverse-engineering and implementation of the first HomematicIP-API client using Python
  (https://github.com/coreGreenberet/homematicip-rest-api)
- @dmalch for adding fakegato-history support (https://github.com/simont77/fakegato-history)
- @smhex for HmIP-DLS and HmIP-BSL support
- @ohueter for thermostat/climate sensor config option
- @aceg1k for improvements in thermostat heating/cooling state handling

## Help needed!
