import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { inspectCircuit, renderSvg } from '../circuit.mjs';

const example = {
  title: 'LED and resistor',
  components: [
    { id: 'V1', kind: 'battery', x: 80, y: 150, rotation: 90, nodes: ['VCC', 'GND'], value: '9 V' },
    { id: 'R1', kind: 'resistor', x: 230, y: 80, nodes: ['VCC', 'LED_A'], value: '1 kΩ' },
    { id: 'D1', kind: 'led', x: 380, y: 80, nodes: ['LED_A', 'GND'] },
    { id: 'G1', kind: 'ground', x: 80, y: 270, nodes: ['GND'] }
  ]
};

test('summarizes a connected circuit and produces a renderable schematic', async () => {
  const summary = inspectCircuit(example);
  assert.deepEqual(summary.nets.find((net) => net.name === 'LED_A')?.pins, [
    { component: 'R1', pin: 2 }, { component: 'D1', pin: 1 }
  ]);
  assert.deepEqual(summary.warnings, []);
  const png = await sharp(Buffer.from(renderSvg(example))).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, 'png');
  assert.ok(metadata.width >= 300 && metadata.height >= 220);
});

test('keeps ambiguous image readings visible and detects structural mistakes', () => {
  const draft = structuredClone(example);
  draft.uncertainties = ['Wire crossing by D1 may be a junction.'];
  draft.components[2].nodes = ['LED_A', 'LED_A'];
  const summary = inspectCircuit(draft);
  assert.equal(summary.uncertainties.length, 1);
  assert.ok(summary.warnings.some((warning) => warning.includes('both terminals')));
  assert.match(renderSvg(draft), /UNCONFIRMED REDRAW/);
});

test('rejects duplicate component references instead of silently merging them', () => {
  const draft = structuredClone(example);
  draft.components[1].id = 'V1';
  assert.throws(() => inspectCircuit(draft), /Duplicate component id/);
});
