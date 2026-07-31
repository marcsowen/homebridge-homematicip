import type {Logger} from 'homebridge';
import PQueue from 'p-queue';

const DEFAULT_QUEUE_LIMIT = 120;
const DEFAULT_REQUEST_TIMEOUT_MILLIS = 30000;

export interface HmIPHttpClientOptions {
  fetch?: typeof globalThis.fetch;
  queueLimit?: number;
  requestTimeoutMillis?: number;
}

export interface HmIPHttpRequestOptions {
  authenticated?: boolean;
  logError?: boolean;
  priority?: number;
  signal?: AbortSignal;
}

export interface HmIPHttpCredentials {
  authToken: string;
  clientAuthToken: string;
  pin: string;
}

export type HmIPHttpErrorKind =
  | 'aborted'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid-json'
  | 'not-initialized'
  | 'queue-full';

export interface HmIPHttpError {
  kind: HmIPHttpErrorKind;
  message: string;
  path: string;
  status?: number;
}

export type HmIPHttpResult =
  | {ok: true; body: unknown}
  | {ok: false; error: HmIPHttpError};

export class HmIPHttpClient {
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly limiter: PQueue;
  private readonly queueLimit: number;
  private readonly requestTimeoutMillis: number;
  private readonly shutdownController = new AbortController();
  private limiterDepleted = false;

  public constructor(
    private readonly log: Logger,
    private readonly baseUrl: URL,
    private readonly credentials: HmIPHttpCredentials,
    options: HmIPHttpClientOptions = {},
  ) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.queueLimit = options.queueLimit ?? DEFAULT_QUEUE_LIMIT;
    this.requestTimeoutMillis = options.requestTimeoutMillis ?? DEFAULT_REQUEST_TIMEOUT_MILLIS;
    this.limiter = new PQueue({
      concurrency: 1,
      // Preserve the original limiter's average of one request per second,
      // while allowing short bursts of up to ten requests.
      intervalCap: 10,
      interval: 10000,
      carryoverIntervalCount: true,
      strict: true,
    });
    this.limiter.on('rateLimit', () => {
      if (!this.limiterDepleted) {
        this.limiterDepleted = true;
        this.log.info('Limiter depleted, throttling requests');
      }
    });
    this.limiter.on('rateLimitCleared', () => {
      if (this.limiterDepleted) {
        this.log.info('Limiter replenished, requests are no longer throttled');
        this.limiterDepleted = false;
      }
    });
  }

  public async request(
    path: string,
    requestBody?: Readonly<Record<string, unknown>>,
    options: HmIPHttpRequestOptions = {},
  ): Promise<HmIPHttpResult> {
    const logError = options.logError ?? true;
    if (this.shutdownController.signal.aborted) {
      return HmIPHttpClient.failure(path, 'aborted', 'connector has been shut down');
    }
    if (this.limiter.size >= this.queueLimit) {
      this.log.warn('Request queue limit reached; dropping request to %s', path);
      return HmIPHttpClient.failure(path, 'queue-full', 'request queue limit reached');
    }

    const url = `${this.baseUrl.toString().replace(/\/$/, '')}/hmip/${path}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'accept': 'application/json',
      'VERSION': '12',
      'CLIENTAUTH': this.credentials.clientAuthToken,
    };
    if (this.credentials.pin) {
      headers.PIN = this.credentials.pin;
    }
    if (options.authenticated ?? true) {
      headers.AUTHTOKEN = this.credentials.authToken;
    }
    const body = requestBody ? JSON.stringify(requestBody) : undefined;
    this.log.debug('Requesting %s', url);

    const requestSignal = this.createRequestSignal(options.signal);
    let response: Response;
    try {
      response = await this.limiter.add(
        () => this.fetchImplementation(url, {
          method: 'POST',
          headers,
          ...(body === undefined ? {} : {body}),
          signal: requestSignal,
        }),
        // Bottleneck treats lower values as higher priority; p-queue does the reverse.
        {priority: -(options.priority ?? 5), signal: requestSignal},
      );
    } catch (error) {
      const failure = this.classifyRequestFailure(path, error, requestSignal, options.signal);
      this.logFailure(failure, logError);
      return failure;
    }

    if (!response.ok) {
      const failure = HmIPHttpClient.failure(
        path,
        'http',
        `HTTP ${response.status} ${response.statusText}`,
        response.status,
      );
      this.logFailure(failure, logError);
      return failure;
    }
    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        const json: unknown = await response.json();
        this.log.debug('API response %d %s: %s', response.status, response.statusText, JSON.stringify(json));
        return {ok: true, body: json};
      } catch (error) {
        const failure = HmIPHttpClient.failure(
          path,
          'invalid-json',
          `invalid JSON response: ${HmIPHttpClient.errorMessage(error)}`,
        );
        this.logFailure(failure, logError);
        return failure;
      }
    }
    this.log.debug('API response %d %s: bytes=%s', response.status, response.statusText,
      response.headers.get('content-length') ?? 'unknown');
    return {ok: true, body: true};
  }

  public shutdown(): void {
    this.shutdownController.abort();
  }

  private createRequestSignal(signal?: AbortSignal): AbortSignal {
    const signals = [this.shutdownController.signal, AbortSignal.timeout(this.requestTimeoutMillis)];
    if (signal) {
      signals.push(signal);
    }
    return AbortSignal.any(signals);
  }

  private classifyRequestFailure(
    path: string,
    error: unknown,
    requestSignal: AbortSignal,
    callerSignal?: AbortSignal,
  ): {ok: false; error: HmIPHttpError} {
    if (this.shutdownController.signal.aborted || callerSignal?.aborted) {
      return HmIPHttpClient.failure(path, 'aborted', HmIPHttpClient.errorMessage(error));
    }
    if (requestSignal.aborted && HmIPHttpClient.isTimeoutReason(requestSignal.reason)) {
      return HmIPHttpClient.failure(path, 'timeout', HmIPHttpClient.errorMessage(error));
    }
    return HmIPHttpClient.failure(path, 'network', HmIPHttpClient.errorMessage(error));
  }

  private logFailure(failure: {ok: false; error: HmIPHttpError}, enabled: boolean): void {
    if (enabled && failure.error.kind !== 'aborted') {
      this.log.error('Cannot request %s: %s', failure.error.path, failure.error.message);
    }
  }

  private static failure(
    path: string,
    kind: HmIPHttpErrorKind,
    message: string,
    status?: number,
  ): {ok: false; error: HmIPHttpError} {
    return {
      ok: false,
      error: {
        kind,
        message,
        path,
        ...(status === undefined ? {} : {status}),
      },
    };
  }

  private static isTimeoutReason(reason: unknown): boolean {
    return reason instanceof Error && reason.name === 'TimeoutError';
  }

  private static errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
