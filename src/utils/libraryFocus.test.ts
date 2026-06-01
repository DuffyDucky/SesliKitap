import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepFocus } from './libraryFocus';

test('ortadan sonraki → indeks artar, sınır yok', () => {
  assert.deepEqual(stepFocus(1, 1, 5), { index: 2, atBoundary: null });
});

test('ortadan önceki → indeks azalır, sınır yok', () => {
  assert.deepEqual(stepFocus(2, -1, 5), { index: 1, atBoundary: null });
});

test('sondan sonraki → aynı indeks, atBoundary=end', () => {
  assert.deepEqual(stepFocus(4, 1, 5), { index: 4, atBoundary: 'end' });
});

test('baştan önceki → aynı indeks, atBoundary=start', () => {
  assert.deepEqual(stepFocus(0, -1, 5), { index: 0, atBoundary: 'start' });
});

test('tek kitap: sonraki → end, önceki → start', () => {
  assert.deepEqual(stepFocus(0, 1, 1), { index: 0, atBoundary: 'end' });
  assert.deepEqual(stepFocus(0, -1, 1), { index: 0, atBoundary: 'start' });
});

test('boş liste: güvenli no-op', () => {
  assert.deepEqual(stepFocus(0, 1, 0), { index: 0, atBoundary: null });
  assert.deepEqual(stepFocus(0, -1, 0), { index: 0, atBoundary: null });
});
