import type {Logger} from 'homebridge';
import type {HmIPConnectionEvent, HmIPState, HmIPStateChange} from 'homematicip-cloud-client-ts';
import {HmIPEventRouter} from './HmIPEventRouter.js';

/** Resynchronizes snapshots without allowing an older connection to overwrite new state. */
export class HmIPConnection {
  private controller: AbortController | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private pending: HmIPStateChange[] | undefined;
  private stopped = false;

  constructor(
    private readonly log: Logger,
    private readonly fetchState: (signal: AbortSignal) => Promise<HmIPState | false>,
    private readonly applyState: (state: HmIPState) => void,
    private readonly applyChange: (change: HmIPStateChange) => void,
    private readonly setReady: (ready: boolean) => void,
    private readonly retryMillis = 5000,
  ) {}

  public connection(event: HmIPConnectionEvent): void {
    if (this.stopped) return;
    this.cancel();
    this.setReady(false);
    if (event === 'disconnected') {
      this.log.warn('Homematic IP connection lost; waiting for a fresh state.');
      return;
    }
    this.controller = new AbortController();
    void this.refresh(this.controller);
  }

  public change(change: HmIPStateChange): void {
    if (this.stopped || !this.controller) return;
    if (this.pending) {
      this.pending.push(change);
    } else {
      this.applyChange(change);
    }
  }

  public stop(): void {
    this.stopped = true;
    this.cancel();
    this.setReady(false);
  }

  private cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
    clearTimeout(this.retry);
    this.retry = undefined;
    this.pending = undefined;
  }

  private async refresh(controller: AbortController): Promise<void> {
    this.pending = [];
    try {
      const state = await this.fetchState(controller.signal);
      if (controller.signal.aborted) return;
      if (!state) throw new Error('Snapshot unavailable');
      const pending = this.pending ?? [];
      // Merge state events before exposing the snapshot. Button events are delivered once below.
      const merger = new HmIPEventRouter(this.log, state, new Map(), {
        addDevice() {}, removeDevice() {}, updateHome() {}, updateSecurityGroups() {},
      });
      for (const change of pending) {
        merger.handle({events: Object.fromEntries(Object.entries(change.events)
          .filter(([, event]) => event.pushEventType !== 'DEVICE_CHANNEL_EVENT'))});
      }
      this.applyState(state);
      this.pending = undefined;
      this.setReady(true);
      for (const change of pending) {
        this.applyChange({events: Object.fromEntries(Object.entries(change.events)
          .filter(([, event]) => event.pushEventType === 'DEVICE_CHANNEL_EVENT'))});
      }
      this.log.info('Homematic IP state synchronized.');
    } catch {
      if (controller.signal.aborted) return;
      // Keep live events flowing while waiting to retry, but do not claim cached state is current.
      const pending = this.pending ?? [];
      this.pending = undefined;
      this.setReady(false);
      for (const change of pending) this.applyChange(change);
      this.log.warn('Cannot refresh Homematic IP state; retrying in %d seconds.', this.retryMillis / 1000);
      this.retry = setTimeout(() => void this.refresh(controller), this.retryMillis);
      this.retry.unref();
    }
  }
}
