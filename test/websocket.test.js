import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {HmIPWebSocketClient} from '../dist/HmIPWebSocketClient.js';

const log = {
  debug() {},
  error() {},
  info() {},
  log() {},
  prefix: '',
  success() {},
  warn() {},
};

function createWebSocketTestHarness(overrides = {}) {
  const sockets = [];
  const intervals = [];
  const timeouts = [];

  class FakeWebSocket extends EventEmitter {
    readyState = 0;
    closeCalls = 0;
    pingCalls = 0;
    terminateCalls = 0;

    open() {
      this.readyState = 1;
      this.emit('open');
    }

    close() {
      this.closeCalls += 1;
      this.readyState = 3;
      this.emit('close');
    }

    ping() {
      this.pingCalls += 1;
    }

    terminate() {
      this.terminateCalls += 1;
      this.readyState = 3;
      this.emit('close');
    }
  }

  const createTimer = (timers, callback, delay) => {
    const timer = {callback, cleared: false, delay};
    timers.push(timer);
    return timer;
  };
  const clearTimer = timer => {
    timer.cleared = true;
  };
  const runTimer = timer => {
    assert.equal(timer.cleared, false);
    timer.callback();
  };
  const runTimeout = timer => {
    assert.equal(timer.cleared, false);
    timer.cleared = true;
    timer.callback();
  };
  const pendingTimers = timers => timers.filter(timer => !timer.cleared);
  const createWebSocket = overrides.createWebSocket ?? (() => {
    const socket = new FakeWebSocket();
    sockets.push(socket);
    return socket;
  });

  return {
    options: {
      clearInterval: clearTimer,
      clearTimeout: clearTimer,
      createWebSocket,
      pingIntervalMillis: 50,
      reconnectBaseMillis: 100,
      reconnectMaxMillis: 400,
      setInterval: (callback, delay) => createTimer(intervals, callback, delay),
      setTimeout: (callback, delay) => createTimer(timeouts, callback, delay),
    },
    pendingIntervals: () => pendingTimers(intervals),
    pendingTimeouts: () => pendingTimers(timeouts),
    runTimer,
    runTimeout,
    sockets,
  };
}

function createClient(harness) {
  return new HmIPWebSocketClient(
    log,
    'wss://ws.example',
    {AUTHTOKEN: 'token', CLIENTAUTH: 'client-token'},
    harness.options,
  );
}

test('connection is idempotent and schedules one reconnect', () => {
  const harness = createWebSocketTestHarness();
  const client = createClient(harness);
  const messages = [];
  const replacementMessages = [];

  client.start(data => messages.push(data.toString()));
  client.start(data => replacementMessages.push(data.toString()));
  assert.equal(harness.sockets.length, 1);

  const firstSocket = harness.sockets[0];
  firstSocket.open();
  firstSocket.emit('message', Buffer.from('current'));
  firstSocket.emit('error', new Error('connection lost'));
  firstSocket.emit('close');

  assert.deepEqual(messages, ['current']);
  assert.deepEqual(replacementMessages, []);
  assert.equal(firstSocket.terminateCalls, 1);
  assert.equal(harness.pendingTimeouts().length, 1);

  harness.runTimeout(harness.pendingTimeouts()[0]);
  assert.equal(harness.sockets.length, 2);
  firstSocket.emit('message', Buffer.from('stale'));
  firstSocket.emit('open');
  assert.deepEqual(messages, ['current']);
  client.stop();
});

test('reconnect uses bounded exponential backoff', () => {
  const reconnectDelays = [];
  const harness = createWebSocketTestHarness({
    createWebSocket: () => {
      throw new Error('offline');
    },
  });
  const originalSetTimeout = harness.options.setTimeout;
  harness.options.setTimeout = (callback, delay) => {
    reconnectDelays.push(delay);
    return originalSetTimeout(callback, delay);
  };
  const client = createClient(harness);

  client.start(() => {});
  for (let attempt = 0; attempt < 4; attempt += 1) {
    harness.runTimeout(harness.pendingTimeouts()[0]);
  }

  assert.deepEqual(reconnectDelays, [100, 200, 400, 400, 400]);
  client.stop();
});

test('heartbeat reconnects an unresponsive connection', () => {
  const harness = createWebSocketTestHarness();
  const client = createClient(harness);

  client.start(() => {});
  const socket = harness.sockets[0];
  socket.open();
  const heartbeat = harness.pendingIntervals()[0];

  harness.runTimer(heartbeat);
  assert.equal(socket.pingCalls, 1);
  harness.runTimer(heartbeat);

  assert.equal(socket.terminateCalls, 1);
  assert.equal(harness.pendingIntervals().length, 0);
  assert.equal(harness.pendingTimeouts().length, 1);
  client.stop();
});

test('stop cancels reconnect and heartbeat timers', () => {
  const harness = createWebSocketTestHarness();
  const client = createClient(harness);

  client.start(() => {});
  const socket = harness.sockets[0];
  socket.open();
  socket.emit('error', new Error('connection lost'));
  assert.equal(harness.pendingTimeouts().length, 1);

  client.stop();
  socket.emit('close');

  assert.equal(harness.pendingIntervals().length, 0);
  assert.equal(harness.pendingTimeouts().length, 0);
  assert.equal(harness.sockets.length, 1);
});
