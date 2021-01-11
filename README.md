# homebridge-homematicip
[![npm](https://img.shields.io/npm/v/homebridge-fhem.svg?style=plastic)](https://www.npmjs.com/package/homebridge-fhem)
[![npm](https://img.shields.io/npm/dt/homebridge-fhem.svg?style=plastic)](https://www.npmjs.com/package/homebridge-fhem)
[![GitHub last commit](https://img.shields.io/github/last-commit/marcsowen/homebridge-homematicip.svg?style=plastic)](https://github.com/marcsowen/homebridge-homematicip)

## Homematic IP platform plugin for homebridge

Uses the inofficial HTTP API and WebSockets for continuous channel updates. 

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

The Access Point ID is printed on the back of your Homematic IP Access Point (HMIP-HAP) and is 
labeled as "SGTIN", e.g. 3014-xxxx-xxxx-xxxx-xxxx-xxxx. 

### Pairing 

If you do not have an auth_token or don't know it, 
leave it empty. After startup, watch the logs and wait for "Press blue, glowing link button of HmIP Access Point now!".
Then press the button and note the "auth_token" that is being generated, add it to your config.json and restart.

## Currently supported devices
- HMIP-HAP (Access Point)
- HMIP-eTRV (Radiator Thermostat)
- HMIP-eTRV-C (Heating-thermostat compact without display)
- HMIP-FROLL (Shutter Actuator - flush-mount)
- HMIP-BROLL (Shutter Actuator - Brand-mount)
- HMIP-WTH (Wall Thermostat)
- HMIP-WTH-2 (Wall Thermostat with Humidity Sensor)
- HMIP-BWTH (Brand Wall Thermostat with Humidity Sensor)

## TODOs
- Implement more devices
- Implement weather device
- Implement PIN protection
- Implement META-Group (Homematic IP rooms) to HomeKit room-Mapping
- Implement custom characteristics (Actuator) for Radiator Thermostats (e.g. to be used in Eve App) 

## Thanks to coreGreenberet
https://github.com/coreGreenberet/homematicip-rest-api


## Help needed!
