export class GameStateManager {
  private _items = new Set<string>();

  addItem(id: string): void  { this._items.add(id); }
  removeItem(id: string): void { this._items.delete(id); }
  hasItem(id: string): boolean { return this._items.has(id); }

  reset(): void { this._items.clear(); }
}

export const gameStateManager = new GameStateManager();
