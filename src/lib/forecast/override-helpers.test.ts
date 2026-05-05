import { describe, expect, it } from 'vitest';
import {
  addItem,
  removeItem,
  updateItem,
  setSingle,
  clearSingle,
  removeItemAt,
  updateItemAt,
} from './override-helpers';

describe('addItem', () => {
  it('appends an item to an undefined array (creates new array)', () => {
    const result = addItem<{ id: string }>(undefined, { id: 'a' });
    expect(result).toEqual([{ id: 'a' }]);
  });

  it('appends an item to an existing array', () => {
    const result = addItem([{ id: 'a' }], { id: 'b' });
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'a' }];
    addItem(input, { id: 'b' });
    expect(input).toEqual([{ id: 'a' }]);
  });
});

describe('removeItem', () => {
  it('returns undefined when removing the last item from a single-item array', () => {
    const result = removeItem([{ id: 'a' }], (i) => i.id === 'a');
    expect(result).toBeUndefined();
  });

  it('removes the matching item from a multi-item array', () => {
    const result = removeItem(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      (i) => i.id === 'b',
    );
    expect(result).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('returns the same array when no item matches', () => {
    const input = [{ id: 'a' }];
    const result = removeItem(input, (i) => i.id === 'z');
    expect(result).toEqual([{ id: 'a' }]);
  });

  it('returns undefined for an undefined input', () => {
    const result = removeItem<{ id: string }>(undefined, () => true);
    expect(result).toBeUndefined();
  });
});

describe('updateItem', () => {
  it('updates the matching item with the partial patch', () => {
    const result = updateItem(
      [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
      (i) => i.id === 'b',
      { value: 99 },
    );
    expect(result).toEqual([{ id: 'a', value: 1 }, { id: 'b', value: 99 }]);
  });

  it('returns the same array when no item matches', () => {
    const input = [{ id: 'a', value: 1 }];
    const result = updateItem(input, (i) => i.id === 'z', { value: 99 });
    expect(result).toEqual([{ id: 'a', value: 1 }]);
  });

  it('returns undefined for an undefined input', () => {
    const result = updateItem<{ value: number }>(undefined, () => true, { value: 1 });
    expect(result).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'a', value: 1 }];
    updateItem(input, (i) => i.id === 'a', { value: 99 });
    expect(input).toEqual([{ id: 'a', value: 1 }]);
  });
});

describe('setSingle / clearSingle', () => {
  it('setSingle returns the new value', () => {
    expect(setSingle({ x: 1 })).toEqual({ x: 1 });
  });

  it('clearSingle returns undefined', () => {
    expect(clearSingle()).toBeUndefined();
  });
});

describe('removeItemAt', () => {
  it('returns undefined when removing the last item from a single-item array', () => {
    expect(removeItemAt([{ id: 'a' }], 0)).toBeUndefined();
  });

  it('removes the item at the specified index', () => {
    const result = removeItemAt([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 1);
    expect(result).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('returns the array unchanged when index is out of bounds', () => {
    const input = [{ id: 'a' }];
    expect(removeItemAt(input, 5)).toBe(input);
  });

  it('returns undefined for an undefined input', () => {
    expect(removeItemAt<{ id: string }>(undefined, 0)).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'a' }, { id: 'b' }];
    removeItemAt(input, 0);
    expect(input).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});

describe('updateItemAt', () => {
  it('updates the item at the specified index with the patch', () => {
    const result = updateItemAt(
      [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
      1,
      { value: 99 },
    );
    expect(result).toEqual([{ id: 'a', value: 1 }, { id: 'b', value: 99 }]);
  });

  it('returns the array unchanged when index is out of bounds', () => {
    const input = [{ id: 'a', value: 1 }];
    expect(updateItemAt(input, 5, { value: 99 })).toBe(input);
  });

  it('returns undefined for an undefined input', () => {
    expect(updateItemAt<{ value: number }>(undefined, 0, { value: 1 })).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'a', value: 1 }];
    updateItemAt(input, 0, { value: 99 });
    expect(input).toEqual([{ id: 'a', value: 1 }]);
  });
});
