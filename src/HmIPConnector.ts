import * as crypto from 'node:crypto';
import * as os from 'node:os';
import type {Logger} from 'homebridge';
import type {RawData} from 'ws';
import {HmIPHttpClient, type HmIPHttpError, type HmIPHttpResult} from './HmIPHttpClient.js';
import {type HmIPState, parseHmIPState} from './HmIPState.js';
import {HmIPWebSocketClient, type HmIPWebSocketOptions} from './HmIPWebSocketClient.js';
import {PLUGIN_NAME, PLUGIN_VERSION} from './settings.js';

export type {HmIPWebSocketOptions as HmIPConnectorWebSocketOptions} from './HmIPWebSocketClient.js';

interface AuthTokenResult {
  authToken: string;
}

interface ConfirmResult {
  clientId: string;
}

export type HmIPPairingAcknowledgement =
  | {status: 'acknowledged'}
  | {status: 'pending'}
  | {status: 'failed'; error: HmIPHttpError};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REQUEST_TIMEOUT_MILLIS = 30000;
const REST_PROTOCOLS = new Set(['http:', 'https:']);
const WEBSOCKET_PROTOCOLS = new Set(['ws:', 'wss:']);

interface HmIPEndpoints {
  rest: URL;
  webSocket: URL;
}

function parseEndpoint(value: string, protocols: ReadonlySet<string>): URL | undefined {
  try {
    const url = new URL(value);
    return protocols.has(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

export class HmIPConnector {

  private readonly accessPoint: string;
  private readonly authToken: string;
  private readonly clientAuthToken: string;
  private readonly pin: string;
  public readonly clientCharacteristics: Record<string, unknown>;

  private readonly log: Logger;
  private readonly fetchImplementation: typeof fetch;
  private endpoints: HmIPEndpoints | undefined;
  private initialization: Promise<boolean> | undefined;
  private readonly shutdownController = new AbortController();

  private httpClient: HmIPHttpClient | undefined;
  private readonly webSocketOptions: HmIPWebSocketOptions;
  private webSocketClient: HmIPWebSocketClient | undefined;

  constructor(
    log: Logger,
    accessPoint: string,
    authToken?: string,
    pin?: string,
    fetchImplementation: typeof fetch = globalThis.fetch,
    webSocketOptions: HmIPWebSocketOptions = {},
  ) {
    this.log = log;
    this.fetchImplementation = fetchImplementation;
    this.webSocketOptions = webSocketOptions;
    this.authToken = authToken ?? '';
    this.pin = pin ?? '';
    this.accessPoint = accessPoint ? accessPoint.replace(/[^a-fA-F0-9 ]/g, '').toUpperCase() : '';
    this.clientCharacteristics = {
      'clientCharacteristics':
        {
          'apiVersion': '10',
          'applicationIdentifier': PLUGIN_NAME,
          'applicationVersion': PLUGIN_VERSION,
          'deviceManufacturer': 'none',
          'deviceType': 'Computer',
          'language': 'de_DE',
          'osType': os.type(),
          'osVersion': os.release(),
        },
      'id': this.accessPoint,
    };

    this.clientAuthToken = crypto
      .createHash('sha512')
      .setEncoding('utf-8')
      .update(`${this.accessPoint}jiLpVitHvWnIGD1yo7MA`)
      .digest('hex')
      .toUpperCase();
  }

  isReadyForUse(): boolean {
    return Boolean(this.accessPoint && this.authToken);
  }

  isReadyForPairing(): boolean {
    return Boolean(this.accessPoint);
  }

  async init(signal?: AbortSignal): Promise<boolean> {
    if (this.shutdownController.signal.aborted) {
      return false;
    }
    if (this.endpoints) {
      return true;
    }
    if (!this.initialization) {
      this.initialization = this.lookupEndpoints(signal)
        .then(endpoints => {
          if (endpoints === false) {
            return false;
          }
          this.endpoints = endpoints;
          this.httpClient = new HmIPHttpClient(
            this.log,
            endpoints.rest,
            {
              authToken: this.authToken,
              clientAuthToken: this.clientAuthToken,
              pin: this.pin,
            },
            {fetch: this.fetchImplementation},
          );
          return true;
        })
        .finally(() => {
          this.initialization = undefined;
        });
    }
    return this.initialization;
  }

  private async lookupEndpoints(signal?: AbortSignal): Promise<HmIPEndpoints | false> {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'VERSION': '12',
      'AUTHTOKEN': '',
      'CLIENTAUTH': this.clientAuthToken,
    };
    try {
      const response = await this.fetchImplementation('https://lookup.homematic.com:48335/getHost', {
        method: 'POST',
        headers,
        body: JSON.stringify(this.clientCharacteristics),
        signal: this.createRequestSignal(signal),
      });
      if (!response.ok) {
        this.log.error('Cannot look up Homematic IP endpoint: HTTP %d %s', response.status, response.statusText);
        return false;
      }
      const result: unknown = await response.json();
      if (!isRecord(result) || typeof result.urlREST !== 'string' || typeof result.urlWebSocket !== 'string') {
        this.log.error('Cannot look up Homematic IP endpoint: response has an invalid shape');
        return false;
      }
      const rest = parseEndpoint(result.urlREST, REST_PROTOCOLS);
      const webSocket = parseEndpoint(result.urlWebSocket, WEBSOCKET_PROTOCOLS);
      if (!rest || !webSocket) {
        this.log.error('Cannot look up Homematic IP endpoint: response contains invalid endpoint URLs');
        return false;
      }
      return {rest, webSocket};
    } catch (error) {
      if (!this.shutdownController.signal.aborted && !signal?.aborted) {
        this.log.error('Cannot look up Homematic IP endpoint: %s', HmIPConnector.errorMessage(error));
      }
      return false;
    }
  }

  async apiCall(path: string, body?: Record<string, unknown>, priority = 5,
    signal?: AbortSignal): Promise<unknown | false> {
    const result = await this.request(true, true, path, body, priority, signal);
    return result.ok ? result.body : false;
  }

  async command(path: string, body: Record<string, unknown>, priority = 5): Promise<void> {
    const result = await this.apiCall(path, body, priority);
    if (result === false) {
      throw new Error(`Homematic IP command failed: ${path}`);
    }
  }

  async getCurrentState(signal?: AbortSignal): Promise<HmIPState | false> {
    const result = await this.request(true, true, 'home/getCurrentState',
      this.clientCharacteristics, 1, signal);
    if (!result.ok) {
      return false;
    }
    const state = parseHmIPState(result.body);
    if (!state.success) {
      if (result.body !== false) {
        this.log.error('Homematic IP returned an invalid home state response: %s.', state.error);
      }
      return false;
    }
    return state.value;
  }

  connectWs(listener: (data: RawData) => void): void {
    if (this.shutdownController.signal.aborted) {
      return;
    }
    if (!this.endpoints) {
      this.log.error('Cannot connect Homematic IP websocket before connector initialization.');
      return;
    }
    if (!this.webSocketClient) {
      this.webSocketClient = new HmIPWebSocketClient(
        this.log,
        this.endpoints.webSocket.toString(),
        {
          'AUTHTOKEN': this.authToken,
          'CLIENTAUTH': this.clientAuthToken,
        },
        this.webSocketOptions,
      );
    }
    this.webSocketClient.start(listener);
  }

  disconnectWs(): void {
    this.webSocketClient?.stop();
    this.webSocketClient = undefined;
  }

  shutdown(): void {
    this.shutdownController.abort();
    this.httpClient?.shutdown();
    this.disconnectWs();
  }

  async authConnectionRequest(deviceId: string, signal?: AbortSignal): Promise<boolean> {
    const request = {
      'deviceId': deviceId,
      'deviceName': PLUGIN_NAME,
      'sgtin': this.accessPoint,
    };
    const result = await this.request(false, true, 'auth/connectionRequest', request, 0, signal);
    return result.ok && Boolean(result.body);
  }

  async authRequestAcknowledged(
    deviceId: string,
    signal?: AbortSignal,
  ): Promise<HmIPPairingAcknowledgement> {
    const request = {
      'deviceId': deviceId,
    };
    const result = await this.request(false, false, 'auth/isRequestAcknowledged', request, 0, signal);
    if (result.ok) {
      return {status: result.body ? 'acknowledged' : 'pending'};
    }
    if (result.error.kind === 'http' && result.error.status === 400) {
      return {status: 'pending'};
    }
    return {status: 'failed', error: result.error};
  }

  async authRequestToken(deviceId: string, signal?: AbortSignal): Promise<AuthTokenResult | false> {
    const request = {
      'deviceId': deviceId,
    };
    const result = await this.request(false, true, 'auth/requestAuthToken', request, 0, signal);
    return result.ok && isRecord(result.body) && typeof result.body.authToken === 'string'
      ? {authToken: result.body.authToken}
      : false;
  }

  async authConfirmToken(deviceId: string, authToken: string, signal?: AbortSignal): Promise<ConfirmResult | false> {
    const request = {
      'deviceId': deviceId,
      'authToken': authToken,
    };
    const result = await this.request(false, true, 'auth/confirmAuthToken', request, 0, signal);
    return result.ok && isRecord(result.body) && typeof result.body.clientId === 'string'
      ? {clientId: result.body.clientId}
      : false;
  }

  private static errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private request(authenticated: boolean, logError: boolean, path: string,
    body?: Record<string, unknown>, priority = 5, signal?: AbortSignal): Promise<HmIPHttpResult> {
    if (!this.httpClient) {
      const error: HmIPHttpError = {
        kind: 'not-initialized',
        message: 'connector has not been initialized',
        path,
      };
      if (logError) {
        this.log.error('Cannot request %s before connector initialization.', path);
      }
      return Promise.resolve({ok: false, error});
    }
    return this.httpClient.request(path, body, {
      authenticated,
      logError,
      priority,
      ...(signal ? {signal} : {}),
    });
  }

  private createRequestSignal(signal?: AbortSignal): AbortSignal {
    const signals = [this.shutdownController.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MILLIS)];
    if (signal) {
      signals.push(signal);
    }
    return AbortSignal.any(signals);
  }

}
