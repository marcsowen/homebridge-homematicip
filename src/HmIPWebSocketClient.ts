import type {Logger} from 'homebridge';
import WebSocket, {type ClientOptions, type RawData} from 'ws';

const PING_INTERVAL_MILLIS = 5000;
const RECONNECT_BASE_MILLIS = 10000;
const RECONNECT_MAX_MILLIS = 60000;

type WebSocketState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'stopped';

export interface HmIPWebSocketOptions {
  createWebSocket?: (url: string, options: ClientOptions) => WebSocket;
  pingIntervalMillis?: number;
  reconnectBaseMillis?: number;
  reconnectMaxMillis?: number;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export class HmIPWebSocketClient {
  private readonly createWebSocket: (url: string, options: ClientOptions) => WebSocket;
  private readonly pingIntervalMillis: number;
  private readonly reconnectBaseMillis: number;
  private readonly reconnectMaxMillis: number;
  private readonly setIntervalImplementation: typeof globalThis.setInterval;
  private readonly clearIntervalImplementation: typeof globalThis.clearInterval;
  private readonly setTimeoutImplementation: typeof globalThis.setTimeout;
  private readonly clearTimeoutImplementation: typeof globalThis.clearTimeout;
  private state: WebSocketState = 'disconnected';
  private generation = 0;
  private alive = false;
  private reconnectAttempt = 0;
  private listener: ((data: RawData) => void) | undefined;
  private pingIntervalId: ReturnType<typeof setInterval> | undefined;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private socket: WebSocket | undefined;

  public constructor(
    private readonly log: Logger,
    private readonly url: string,
    private readonly headers: Readonly<Record<string, string>>,
    options: HmIPWebSocketOptions = {},
  ) {
    this.createWebSocket = options.createWebSocket ?? ((url, socketOptions) => new WebSocket(url, socketOptions));
    this.pingIntervalMillis = options.pingIntervalMillis ?? PING_INTERVAL_MILLIS;
    this.reconnectBaseMillis = options.reconnectBaseMillis ?? RECONNECT_BASE_MILLIS;
    this.reconnectMaxMillis = options.reconnectMaxMillis ?? RECONNECT_MAX_MILLIS;
    this.setIntervalImplementation = options.setInterval ?? globalThis.setInterval;
    this.clearIntervalImplementation = options.clearInterval ?? globalThis.clearInterval;
    this.setTimeoutImplementation = options.setTimeout ?? globalThis.setTimeout;
    this.clearTimeoutImplementation = options.clearTimeout ?? globalThis.clearTimeout;
  }

  public start(listener: (data: RawData) => void): void {
    if (this.state !== 'disconnected') {
      this.log.debug('Ignoring websocket start while state is %s.', this.state);
      return;
    }
    this.listener = listener;
    this.open();
  }

  public stop(): void {
    if (this.state === 'stopped') {
      return;
    }
    if (this.state !== 'disconnected') {
      this.log.info('HmIP websocket shutdown...');
    }
    this.state = 'stopped';
    this.listener = undefined;
    this.reconnectAttempt = 0;
    this.generation += 1;
    this.clearTimers();
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }

  private open(): void {
    if (this.state === 'stopped') {
      return;
    }
    this.clearReconnectTimeout();
    this.clearPingInterval();
    this.state = 'connecting';
    const generation = ++this.generation;
    let socket: WebSocket;
    try {
      socket = this.createWebSocket(this.url, {headers: this.headers});
    } catch (error) {
      this.log.error('Cannot create Homematic IP websocket: %s', HmIPWebSocketClient.errorMessage(error));
      this.state = 'disconnected';
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.on('message', data => {
      if (this.isCurrent(socket, generation)) {
        this.listener?.(data);
      }
    });
    socket.on('open', () => {
      if (!this.isCurrent(socket, generation)) {
        return;
      }
      this.log.info('HmIP websocket connected.');
      this.state = 'connected';
      this.reconnectAttempt = 0;
      this.alive = true;
      this.startHeartbeat(socket, generation);
    });
    socket.on('pong', () => {
      if (this.isCurrent(socket, generation)) {
        this.alive = true;
      }
    });
    socket.on('close', () => {
      if (this.isCurrent(socket, generation)) {
        this.log.info('HmIP websocket disconnected.');
        this.handleDisconnect(socket, generation, false);
      }
    });
    socket.on('error', error => {
      if (this.isCurrent(socket, generation)) {
        this.log.error('HmIP websocket error: %s', error.message);
        this.handleDisconnect(socket, generation, true);
      }
    });
    socket.on('unexpected-response', (_request, response) => {
      if (this.isCurrent(socket, generation)) {
        this.log.error('HmIP websocket unexpected response: %s (%s)',
          response.statusMessage, response.statusCode);
        this.handleDisconnect(socket, generation, true);
      }
    });
  }

  private handleDisconnect(socket: WebSocket, generation: number, terminate: boolean): void {
    if (!this.isCurrent(socket, generation)) {
      return;
    }
    this.clearPingInterval();
    this.socket = undefined;
    this.state = 'disconnected';
    if (terminate && socket.readyState !== WebSocket.CLOSED) {
      socket.terminate();
    }
    this.scheduleReconnect();
  }

  private startHeartbeat(socket: WebSocket, generation: number): void {
    this.clearPingInterval();
    this.pingIntervalId = this.setIntervalImplementation(() => {
      if (!this.isCurrent(socket, generation) || this.state !== 'connected') {
        return;
      }
      if (!this.alive) {
        this.log.warn('HmIP websocket heartbeat timed out; reconnecting.');
        this.handleDisconnect(socket, generation, true);
        return;
      }
      this.alive = false;
      try {
        socket.ping();
      } catch (error) {
        this.log.error('Cannot ping Homematic IP websocket: %s', HmIPWebSocketClient.errorMessage(error));
        this.handleDisconnect(socket, generation, true);
      }
    }, this.pingIntervalMillis);
  }

  private scheduleReconnect(): void {
    if (this.state === 'stopped' || this.reconnectTimeoutId) {
      return;
    }
    const delay = Math.min(
      this.reconnectBaseMillis * (2 ** this.reconnectAttempt),
      this.reconnectMaxMillis,
    );
    this.reconnectAttempt += 1;
    this.state = 'reconnecting';
    this.log.info('Reconnecting Homematic IP websocket in %d seconds.', delay / 1000);
    this.reconnectTimeoutId = this.setTimeoutImplementation(() => {
      this.reconnectTimeoutId = undefined;
      if (this.state === 'reconnecting') {
        this.open();
      }
    }, delay);
  }

  private isCurrent(socket: WebSocket, generation: number): boolean {
    return this.socket === socket && this.generation === generation;
  }

  private clearPingInterval(): void {
    if (this.pingIntervalId) {
      this.clearIntervalImplementation(this.pingIntervalId);
      this.pingIntervalId = undefined;
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      this.clearTimeoutImplementation(this.reconnectTimeoutId);
      this.reconnectTimeoutId = undefined;
    }
  }

  private clearTimers(): void {
    this.clearPingInterval();
    this.clearReconnectTimeout();
  }

  private static errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
