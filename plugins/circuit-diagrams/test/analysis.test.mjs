import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDc } from '../analysis.mjs';

const divider = {
  title: '10 V divider',
  components: [
    { id: 'V1', kind: 'voltage_source', x: 80, y: 150, nodes: ['VIN', 'GND'], value: '10V' },
    { id: 'R1', kind: 'resistor', x: 200, y: 80, nodes: ['VIN', 'MID'], value: '1kΩ' },
    { id: 'R2', kind: 'resistor', x: 320, y: 80, nodes: ['MID', 'GND'], value: '1kΩ' }
  ]
};

test('nodal and loop analysis solve the divider with consistent current and power', () => {
  const node = analyzeDc(divider, 'nodal');
  const loop = analyzeDc(divider, 'mesh');
  assert.equal(node.node_voltages_V.VIN, 10);
  assert.equal(node.node_voltages_V.MID, 5);
  assert.equal(node.branches.find((b) => b.id === 'R1').current_A, 0.005);
  assert.equal(node.branches.find((b) => b.id === 'V1').absorbed_power_W, -0.05);
  assert.ok(Math.abs(node.power_balance_W) < 1e-12);
  assert.equal(loop.loop_currents_A.L1, 0.005);
  assert.deepEqual(loop.equations, ['2000·I(L1) = 10']);
});

test('two loops sharing a resistor produce coupled KVL equations', () => {
  const circuit = structuredClone(divider);
  circuit.components[0].value = '12V';
  circuit.components.push({ id: 'R3', kind: 'resistor', x: 320, y: 180, nodes: ['VIN', 'MID'], value: '2kΩ' });
  const result = analyzeDc(circuit, 'mesh');
  assert.ok(Math.abs(result.node_voltages_V.MID - 7.2) < 1e-10);
  assert.ok(Math.abs(result.loop_currents_A.L1 - 0.0072) < 1e-10);
  assert.ok(Math.abs(result.loop_currents_A.L2 - 0.0024) < 1e-10);
  assert.match(result.equations[0], /- 1000·I\(L2\)/);
});

test('current-source direction sets voltage polarity and loop constraint', () => {
  const circuit = { components: [
    { id: 'I1', kind: 'current_source', x: 80, y: 80, nodes: ['GND', 'N'], value: '2mA' },
    { id: 'R1', kind: 'resistor', x: 200, y: 80, nodes: ['N', 'GND'], value: '1kΩ' }
  ] };
  const result = analyzeDc(circuit, 'mesh');
  assert.equal(result.node_voltages_V.N, 2);
  assert.equal(result.loop_currents_A.L1, 0.002);
  assert.ok(Math.abs(result.power_balance_W) < 1e-12);
});

test('declines unresolved images and nonlinear devices instead of inventing values', () => {
  const uncertain = { ...divider, uncertainties: ['R2 value may be 10kΩ'] };
  assert.throws(() => analyzeDc(uncertain), /uncertain image details/);
  const nonlinear = structuredClone(divider);
  nonlinear.components[2].kind = 'led';
  assert.throws(() => analyzeDc(nonlinear), /needs a model/);
});
