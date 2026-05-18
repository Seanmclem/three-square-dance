import type { BusEventName, BusCallback, BusEvents } from "@/types";

export class EventBus {
  private _listeners: Partial<{ [K in BusEventName]: BusCallback<K>[] }> = {};

  on<K extends BusEventName>(event: K, cb: BusCallback<K>): () => void {
    if (!this._listeners[event]) {
      (this._listeners[event] as unknown as BusCallback<K>[]) = [];
    }
    (this._listeners[event] as BusCallback<K>[]).push(cb);
    return () => this.off(event, cb);
  }

  off<K extends BusEventName>(event: K, cb: BusCallback<K>): void {
    const listeners = this._listeners[event] as BusCallback<K>[] | undefined;
    if (!listeners) return;
    (this._listeners[event] as BusCallback<K>[]) = listeners.filter(l => l !== cb);
  }

  emit<K extends BusEventName>(event: K, payload: BusEvents[K]): void {
    const listeners = this._listeners[event] as BusCallback<K>[] | undefined;
    if (listeners) listeners.forEach(cb => cb(payload));
  }
}
