import type { Activity, Layer, Snapshot } from './client';

type Readers = {
  readActivity(id: string, signal: AbortSignal): Promise<Activity>;
  readSnapshot(id: string, signal: AbortSignal): Promise<Snapshot>;
};
type Flight = { generation: number; controller: AbortController; promise: Promise<Snapshot> };
const cancelled = () => new DOMException('活动读取已被取消或替换。', 'AbortError');

/** Activity-owned reads survive a child sheet changing layer. No cache is shared
 * across activities or retained outside the mounted activity workspace. */
export class ActivitySnapshotLoader {
  private generation = 0;
  private cached: Snapshot | null = null;
  private flight: Flight | null = null;
  private lastLayer: Layer | null = null;

  constructor(private readonly id: string, private readonly readers: Readers) {}

  /** Only a layer's first read may reuse facts. Refresh/conflict/form/import
   * callers use fresh, which supersedes even an in-flight layer validation. */
  async load(layer: Layer, signal: AbortSignal): Promise<Snapshot> {
    if (signal.aborted) throw cancelled();
    const mode = this.lastLayer !== null && this.lastLayer !== layer ? 'layer' : 'fresh';
    this.lastLayer = layer;
    const promise = mode === 'fresh' ? this.start(false) : this.flight?.promise ?? this.start(true);
    const result = await promise;
    // A child cancellation only prevents that child from publishing the result.
    if (signal.aborted || !this.isCurrent(result)) throw cancelled();
    return result;
  }

  isCurrent(snapshot: Snapshot) { return this.cached === snapshot; }

  /** Cleanup is reusable for React's setup/cleanup/setup development cycle. */
  dispose() {
    this.lastLayer = null;
    this.invalidate();
  }

  private invalidate() {
    this.generation++;
    this.flight?.controller.abort();
    this.flight = null;
    this.cached = null;
  }

  private start(reuse: boolean): Promise<Snapshot> {
    const previous = reuse ? this.cached : null;
    this.invalidate();
    const generation = this.generation;
    const controller = new AbortController();
    const valid = () => {
      if (controller.signal.aborted || generation !== this.generation) throw cancelled();
    };
    const promise = (async () => {
      let result: Snapshot;
      if (previous) {
        // Recheck authorization and submission independently of the revision.
        // Linked review submission does not increment the activity revision.
        const activity = await this.readers.readActivity(this.id, controller.signal);
        valid();
        if (activity.id !== this.id) throw new Error('活动读取身份不一致。');
        result = activity.revision === previous.activity.revision
          ? { ...previous, activity }
          : await this.readers.readSnapshot(this.id, controller.signal);
      } else result = await this.readers.readSnapshot(this.id, controller.signal);
      valid();
      if (result.activity.id !== this.id) throw new Error('活动读取身份不一致。');
      this.cached = result;
      return result;
    })().finally(() => {
      if (this.flight?.generation === generation) this.flight = null;
    });
    this.flight = { generation, controller, promise };
    return promise;
  }
}
