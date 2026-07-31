import assert from 'node:assert/strict';
import test from 'node:test';
import {HmIPConnector} from '../dist/HmIPConnector.js';
import {HmIPHttpClient} from '../dist/HmIPHttpClient.js';

function createLog() {
  const calls = {debug: [], error: [], info: [], warn: []};
  return {
    calls,
    log: {
      debug: (...args) => calls.debug.push(args),
      error: (...args) => calls.error.push(args),
      info: (...args) => calls.info.push(args),
      log() {},
      prefix: '',
      success() {},
      warn: (...args) => calls.warn.push(args),
    },
  };
}

const credentials = {
  authToken: 'auth-token',
  clientAuthToken: 'client-token',
  pin: '1234',
};

test('HTTP client sends authenticated JSON requests', async () => {
  const {log} = createLog();
  const requests = [];
  const client = new HmIPHttpClient(log, new URL('https://rest.example/'), credentials, {
    fetch: async (url, options) => {
      requests.push({options, url});
      return new Response(JSON.stringify({success: true}), {
        headers: {'content-type': 'application/json'},
        status: 200,
      });
    },
  });

  const result = await client.request('device/control', {on: true});
  const unauthenticatedResult = await client.request('auth/request', undefined, {authenticated: false});

  assert.deepEqual(result, {ok: true, body: {success: true}});
  assert.deepEqual(unauthenticatedResult, {ok: true, body: {success: true}});
  assert.equal(requests[0].url, 'https://rest.example/hmip/device/control');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.AUTHTOKEN, 'auth-token');
  assert.equal(requests[0].options.headers.CLIENTAUTH, 'client-token');
  assert.equal(requests[0].options.headers.PIN, '1234');
  assert.equal(requests[0].options.body, JSON.stringify({on: true}));
  assert.equal('AUTHTOKEN' in requests[1].options.headers, false);
  client.shutdown();
});

test('HTTP client handles malformed JSON as a request failure', async () => {
  const {calls, log} = createLog();
  const client = new HmIPHttpClient(log, new URL('https://rest.example'), credentials, {
    fetch: async () => new Response('{invalid', {
      headers: {'content-type': 'application/json'},
      status: 200,
    }),
  });

  const result = await client.request('home/getCurrentState');
  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'invalid-json');
  assert.equal(calls.error.length, 1);
  assert.equal(calls.error[0][0], 'Cannot request %s: %s');
  client.shutdown();
});

test('HTTP client rejects unsuccessful statuses and accepts empty success responses', async () => {
  const {log} = createLog();
  const responses = [
    new Response(undefined, {status: 503, statusText: 'Unavailable'}),
    new Response(undefined, {status: 204}),
  ];
  const client = new HmIPHttpClient(log, new URL('https://rest.example'), credentials, {
    fetch: async () => responses.shift(),
  });

  assert.deepEqual(await client.request('first'), {
    ok: false,
    error: {
      kind: 'http',
      message: 'HTTP 503 Unavailable',
      path: 'first',
      status: 503,
    },
  });
  assert.deepEqual(await client.request('second'), {ok: true, body: true});
  client.shutdown();
});

test('HTTP client shutdown aborts an active request', async () => {
  const {log} = createLog();
  let requestStarted;
  const started = new Promise(resolve => {
    requestStarted = resolve;
  });
  const client = new HmIPHttpClient(log, new URL('https://rest.example'), credentials, {
    fetch: async (_url, options) => {
      requestStarted();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {once: true});
      });
    },
  });

  const request = client.request('long-running');
  await started;
  client.shutdown();

  const abortedResult = await request;
  assert.equal(abortedResult.ok, false);
  assert.equal(abortedResult.error.kind, 'aborted');
  const shutdownResult = await client.request('after-shutdown');
  assert.equal(shutdownResult.ok, false);
  assert.equal(shutdownResult.error.kind, 'aborted');
});

test('connector rejects operations before initialization', async () => {
  const {calls, log} = createLog();
  let sockets = 0;
  const connector = new HmIPConnector(log, '3014-1234', 'token', undefined, async () => {
    throw new Error('fetch should not be called');
  }, {
    createWebSocket: () => {
      sockets += 1;
      throw new Error('socket should not be created');
    },
  });

  assert.equal(await connector.apiCall('home/getCurrentState'), false);
  connector.connectWs(() => {});

  assert.equal(sockets, 0);
  assert.equal(calls.error.length, 2);
  connector.shutdown();
});

test('connector validates endpoint URLs and current-state responses', async () => {
  const {log} = createLog();
  const invalidEndpointConnector = new HmIPConnector(log, '3014-1234', 'token', undefined, async () =>
    new Response(JSON.stringify({urlREST: 'ftp://rest.example', urlWebSocket: 'https://ws.example'}), {
      headers: {'content-type': 'application/json'},
      status: 200,
    }));
  assert.equal(await invalidEndpointConnector.init(), false);
  invalidEndpointConnector.shutdown();

  let requestCount = 0;
  const invalidStateConnector = new HmIPConnector(log, '3014-1234', 'token', undefined, async () => {
    requestCount += 1;
    return requestCount === 1
      ? new Response(JSON.stringify({urlREST: 'https://rest.example', urlWebSocket: 'wss://ws.example'}), {
        headers: {'content-type': 'application/json'},
        status: 200,
      })
      : new Response(JSON.stringify({devices: {}, groups: {}, home: {}}), {
        headers: {'content-type': 'application/json'},
        status: 200,
      });
  });

  assert.equal(await invalidStateConnector.init(), true);
  assert.equal(await invalidStateConnector.getCurrentState(), false);
  invalidStateConnector.shutdown();
});

test('connector distinguishes pairing progress from transport failure', async () => {
  const {log} = createLog();
  const responses = [
    new Response(JSON.stringify({urlREST: 'https://rest.example', urlWebSocket: 'wss://ws.example'}), {
      headers: {'content-type': 'application/json'},
      status: 200,
    }),
    new Response(JSON.stringify(false), {
      headers: {'content-type': 'application/json'},
      status: 200,
    }),
    new Response(undefined, {status: 400, statusText: 'Bad Request'}),
    new Response(JSON.stringify(true), {
      headers: {'content-type': 'application/json'},
      status: 200,
    }),
  ];
  const connector = new HmIPConnector(log, '3014-1234', 'token', undefined, async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error('network unavailable');
    }
    return response;
  });
  assert.equal(await connector.init(), true);

  assert.deepEqual(await connector.authRequestAcknowledged('client'), {status: 'pending'});
  assert.deepEqual(await connector.authRequestAcknowledged('client'), {status: 'pending'});
  assert.deepEqual(await connector.authRequestAcknowledged('client'), {status: 'acknowledged'});
  const failure = await connector.authRequestAcknowledged('client');
  assert.equal(failure.status, 'failed');
  assert.equal(failure.error.kind, 'network');
  assert.equal(failure.error.message, 'network unavailable');
  connector.shutdown();
});
