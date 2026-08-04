#!/usr/bin/env node

import {access, readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {HmIPClient, type HmIPDevice, isHmIPRecord} from 'homematicip-cloud-client-ts';
import {redactHmIPDeviceRecord} from '../HmIPDiagnostics.js';
import {PLATFORM_NAME, PLUGIN_NAME, PLUGIN_VERSION} from '../settings.js';

interface CliOptions {
  all: boolean;
  configPath?: string;
  deviceQuery?: string;
  platformName?: string;
}

interface DiagnosticPlatformConfig {
  access_point: string;
  auth_token?: string;
  name?: string;
  pin?: string;
  platform: string;
}

const usage = `Usage: homebridge-homematicip-dump [options]

Create a redacted Homematic IP device record suitable for a public issue.

Options:
  --device <model-or-type>  Select devices by modelType or device type
  --all                     Include every device (must be explicitly requested)
  --config <path>           Explicit Homebridge config.json path
  --platform-name <name>    Select a named HomematicIP platform when multiple exist
  --help                    Show this help

Examples:
  homebridge-homematicip-dump --device HmIP-WSM
  homebridge-homematicip-dump --device WATERING_ACTUATOR > hmip-wsm.json
`;

function parseArguments(arguments_: readonly string[]): CliOptions | 'help' {
  const options: CliOptions = {
    all: false,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help' || argument === '-h') {
      return 'help';
    }
    if (argument === '--all') {
      options.all = true;
      continue;
    }
    if (argument === '--device' || argument === '--config' || argument === '--platform-name') {
      const value = arguments_[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      if (argument === '--device') {
        options.deviceQuery = value;
      } else if (argument === '--config') {
        options.configPath = value;
      } else {
        options.platformName = value;
      }
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  if (options.all === (options.deviceQuery !== undefined)) {
    throw new Error('Choose exactly one of --device <model-or-type> or --all');
  }
  return options;
}

async function resolveConfigPath(explicitPath?: string): Promise<string> {
  if (explicitPath) {
    return explicitPath;
  }
  const candidates = [
    '/var/lib/homebridge/config.json',
    '/homebridge/config.json',
    path.join(homedir(), '.homebridge', 'config.json'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard Homebridge storage location.
    }
  }
  throw new Error(`No Homebridge config.json found. Checked: ${candidates.join(', ')}. Use --config <path>.`);
}

function isDiagnosticPlatformConfig(value: unknown): value is DiagnosticPlatformConfig {
  return isHmIPRecord(value)
    && value.platform === PLATFORM_NAME
    && typeof value.access_point === 'string'
    && (value.auth_token === undefined || typeof value.auth_token === 'string')
    && (value.pin === undefined || typeof value.pin === 'string')
    && (value.name === undefined || typeof value.name === 'string');
}

async function readPlatformConfig(configPath: string, platformName?: string): Promise<DiagnosticPlatformConfig> {
  const contents = await readFile(configPath, 'utf8');
  const config: unknown = JSON.parse(contents);
  if (!isHmIPRecord(config) || !Array.isArray(config.platforms)) {
    throw new Error(`No platforms array found in ${configPath}`);
  }
  const candidates = config.platforms.filter(isDiagnosticPlatformConfig)
    .filter(platform => platformName === undefined || platform.name === platformName);
  if (candidates.length === 0) {
    throw new Error(platformName
      ? `No ${PLATFORM_NAME} platform named ${platformName} found in ${configPath}`
      : `No ${PLATFORM_NAME} platform found in ${configPath}`);
  }
  if (candidates.length > 1) {
    throw new Error(`Multiple ${PLATFORM_NAME} platforms found; select one with --platform-name`);
  }
  return candidates[0] as DiagnosticPlatformConfig;
}

function matchesDevice(device: HmIPDevice, query: string): boolean {
  const normalizedQuery = query.toLocaleLowerCase();
  return device.modelType.toLocaleLowerCase().includes(normalizedQuery)
    || device.type.toLocaleLowerCase().includes(normalizedQuery);
}

async function run(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options === 'help') {
    process.stdout.write(usage);
    return;
  }

  const configPath = await resolveConfigPath(options.configPath);
  const platformConfig = await readPlatformConfig(configPath, options.platformName);
  if (!platformConfig.auth_token) {
    throw new Error('The selected HomematicIP platform has no auth_token; finish pairing before creating a dump');
  }
  const logger = {
    debug() {},
    info() {},
    warn: (message: string, ...parameters: unknown[]) => console.error(message, ...parameters),
    error: (message: string, ...parameters: unknown[]) => console.error(message, ...parameters),
  };
  const client = new HmIPClient(logger, {
    accessPoint: platformConfig.access_point,
    applicationIdentifier: PLUGIN_NAME,
    applicationVersion: PLUGIN_VERSION,
    deviceName: `${PLUGIN_NAME} diagnostics`,
    ...(platformConfig.auth_token === undefined ? {} : {authToken: platformConfig.auth_token}),
    ...(platformConfig.pin === undefined ? {} : {pin: platformConfig.pin}),
  });

  try {
    if (!(await client.init()).valueOf()) {
      throw new Error('Could not initialize the Homematic IP cloud connection');
    }
    const state = await client.getCurrentState();
    if (state === false) {
      throw new Error('Could not retrieve the Homematic IP state');
    }
    const devices = Object.values(state.devices)
      .filter(device => options.all || matchesDevice(device, options.deviceQuery as string))
      .sort((left, right) => left.modelType.localeCompare(right.modelType));
    if (devices.length === 0) {
      throw new Error(`No device matched ${options.deviceQuery}`);
    }
    const output = {
      diagnosticFormat: 'homebridge-homematicip-device-v1',
      pluginVersion: PLUGIN_VERSION,
      devices: devices.map(redactHmIPDeviceRecord),
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    client.shutdown();
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
