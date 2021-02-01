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

## Currently supported devices

- HmIP-HAP (Access Point)
- HmIP-eTRV (Radiator Thermostat)
- HmIP-eTRV-C (Heating-thermostat compact without display)
- HmIP-FROLL (Shutter Actuator - flush-mount)
- HmIP-BROLL (Shutter Actuator - brand-mount)
- HmIP-FBL (Blind Actuator - flush-mount)
- HmIP-BBL (Blind Actuator - brand-mount)
- HmIP-WTH (Wall Thermostat)
- HmIP-WTH-2 (Wall Thermostat with Humidity Sensor)
- HmIP-BWTH (Brand Wall Thermostat with Humidity Sensor)
- HmIP-WTH-B (Wall Thermostat – basic)
- ALPHA-IP-RBG (Alpha IP Wall Thermostat Display)
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
- HmIP-PCBS2 (Switch Circuit Board - 2x channels) (*)
- HmIP-MOD-OC8 ( Open Collector Module ) (*)
- HmIP-WHS2 (Switch Actuator for heating systems – 2x channels) (*)
- HmIP-DRS8 (Homematic IP Wired Switch Actuator – 8x channels) (*)
- HmIP-DRSI4 (Homematic IP Switch Actuator for DIN rail mount – 4x channels) (*)
- HmIP-PSM (Pluggable Switch and Meter)
- HmIP-BSM (Brand Switch and Meter)
- HmIP-FSM, HmIP-FSM16 (Full flush Switch and Meter)
- HmIP-MOD-TM (Garage Door Module Tormatic)
- HmIP-MOD-HO (Garage Door Module for Hörmann)
- HmIP-SWD (Water sensor)

(*) Currently, only first channel is supported.

## TODOs

- Implement more devices
- Implement weather device
- Implement META-Group (Homematic IP rooms) to HomeKit room-Mapping
- Implement custom characteristics (Actuator) for Radiator Thermostats (e.g. to be used in Eve App) 
- Implement custom EVE logging (https://github.com/simont77/fakegato-history)

## Many thanks to coreGreenberet

https://github.com/coreGreenberet/homematicip-rest-api

## Help needed!
