import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampPanelWidth,
  formatCapacity,
  formatPartitionCapacity,
  formatRate,
} from './probeFormatting.js';

test('formatPartitionCapacity converts large GiB strings to TiB-width labels', () => {
  assert.equal(formatPartitionCapacity('16833.1G'), '16.4T');
  assert.equal(formatPartitionCapacity('8104.2G'), '7.9T');
});

test('formatCapacity keeps compact binary units across MiB, GiB, and TiB', () => {
  assert.equal(formatCapacity(0), '0M');
  assert.equal(formatCapacity(512), '512M');
  assert.equal(formatCapacity(2048), '2.0G');
  assert.equal(formatCapacity(16833.1 * 1024), '16.4T');
});

test('formatRate promotes sustained high throughput beyond MiB per second', () => {
  assert.equal(formatRate(0), '0 B/s');
  assert.equal(formatRate(0.5), '512 B/s');
  assert.equal(formatRate(32), '32.0 KB/s');
  assert.equal(formatRate(2048), '2.00 MB/s');
  assert.equal(formatRate(2 * 1024 * 1024), '2.00 GB/s');
});

test('clampPanelWidth keeps the probe sidebar usable but bounded', () => {
  assert.equal(clampPanelWidth(120), 280);
  assert.equal(clampPanelWidth(360), 360);
  assert.equal(clampPanelWidth(960), 560);
});
