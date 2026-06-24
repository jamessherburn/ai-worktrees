import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareByCreatedAtDesc, createdAtIso } from './path-created-at.js';

describe('path-created-at', () => {
  it('compareByCreatedAtDesc sorts newest first', () => {
    const items = [
      { createdAt: createdAtIso(Date.parse('2024-01-01T00:00:00.000Z')) },
      { createdAt: createdAtIso(Date.parse('2025-06-01T00:00:00.000Z')) },
      { createdAt: createdAtIso(Date.parse('2024-06-01T00:00:00.000Z')) },
    ];
    items.sort(compareByCreatedAtDesc);
    assert.equal(items[0].createdAt, createdAtIso(Date.parse('2025-06-01T00:00:00.000Z')));
    assert.equal(items[2].createdAt, createdAtIso(Date.parse('2024-01-01T00:00:00.000Z')));
  });
});
