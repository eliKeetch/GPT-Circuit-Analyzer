import { normalizeCircuit } from './circuit.mjs';

const PREFIX = { '': 1, p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

function parseValue(raw, kind, id) {
  const value = raw.replace(/[µμ]/g, 'u').replace(/Ω/g, 'ohm').replace(/\s+/g, '');
  const unit = kind === 'resistor' ? '(?:ohms?|[Rr])?' : kind === 'current_source' ? '(?:[Aa])?' : '(?:[Vv])?';
  const match = value.match(new RegExp(`^([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)([pnumkKMG]?)${unit}$`, 'i'));
  if (!match) throw new Error(`${id}: value "${raw}" is not a numeric ${kind === 'resistor' ? 'resistance' : kind === 'current_source' ? 'current' : 'voltage'} (examples: 1kΩ, 2mA, 9V).`);
  const scale = PREFIX[match[2]];
  if (scale === undefined) throw new Error(`${id}: unsupported unit prefix.`);
  const number = Number(match[1]) * scale;
  if (!Number.isFinite(number) || (kind === 'resistor' && number <= 0)) throw new Error(`${id}: value must be finite${kind === 'resistor' ? ' and positive' : ''}.`);
  return number;
}

function fmt(value) {
  if (Math.abs(value) < 1e-12) return '0';
  return Number(value.toPrecision(6)).toString();
}

function equation(row, names, rhs) {
  const terms = row.flatMap((coefficient, i) => Math.abs(coefficient) < 1e-15 ? [] : [{ coefficient, name: names[i] }]);
  const left = terms.map(({ coefficient, name }, i) => `${coefficient < 0 ? i ? ' - ' : '-' : i ? ' + ' : ''}${fmt(Math.abs(coefficient))}·${name}`).join('') || '0';
  return `${left} = ${fmt(rhs)}`;
}

function solve(matrix, rhs) {
  const n = rhs.length;
  if (n === 0) return [];
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-13) throw new Error('The circuit equations are singular or inconsistent. Check for floating nodes, conflicting ideal sources, or a current source without a return path.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= scale;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function prepare(input) {
  const circuit = normalizeCircuit(input);
  if (circuit.uncertainties.length) throw new Error('This circuit still has uncertain image details. Confirm them and clear uncertainties before numerical analysis.');
  const unsupported = circuit.components.filter((c) => !['resistor', 'voltage_source', 'battery', 'current_source', 'ground'].includes(c.kind));
  if (unsupported.length) throw new Error(`Linear DC analysis needs a model for ${unsupported.map((c) => `${c.id} (${c.kind})`).join(', ')}. Supported parts: resistors, ideal voltage/current sources, batteries, and ground.`);
  const groundNames = new Set(['GND', 'GROUND', '0']);
  for (const c of circuit.components) if (c.kind === 'ground') groundNames.add(c.nodes[0].toUpperCase());
  const nets = new Set(circuit.components.flatMap((c) => c.nodes));
  if (![...nets].some((net) => groundNames.has(net.toUpperCase()))) throw new Error('Add a GND, GROUND, or 0 reference net before numerical analysis.');
  const canonical = (net) => groundNames.has(net.toUpperCase()) ? 'GND' : net;
  const edges = circuit.components.filter((c) => c.kind !== 'ground').map((c) => {
    if (c.nodes[0] === c.nodes[1]) throw new Error(`${c.id} has both pins on one net; resolve that connection before analysis.`);
    const kind = c.kind === 'battery' ? 'voltage_source' : c.kind;
    return { id: c.id, kind, a: canonical(c.nodes[0]), b: canonical(c.nodes[1]), value: parseValue(c.value, kind, c.id), label: c.value };
  });
  if (edges.length === 0) throw new Error('Add a source and at least one connected branch for analysis.');
  const nodeNames = [...new Set(edges.flatMap((e) => [e.a, e.b]))];
  if (!nodeNames.includes('GND')) throw new Error('The reference net is not connected to any branch.');
  if (nodeNames.length > 30 || edges.length > 40) throw new Error('This analyzer supports up to 30 nets and 40 branches.');
  return { title: circuit.title, edges, nodeNames, ground: 'GND', assumptions: ['Linear ideal DC circuit', 'Source and branch current is positive from pin 1 to pin 2', 'Battery and voltage-source pin 1 is positive'] };
}

function nodal(prepared) {
  const { edges, nodeNames } = prepared;
  const nodes = nodeNames.filter((n) => n !== 'GND');
  const sources = edges.filter((e) => e.kind === 'voltage_source');
  const size = nodes.length + sources.length;
  const A = Array.from({ length: size }, () => Array(size).fill(0));
  const b = Array(size).fill(0);
  const index = new Map(nodes.map((name, i) => [name, i]));
  const idx = (name) => name === 'GND' ? -1 : index.get(name);
  for (const edge of edges) {
    const i = idx(edge.a), j = idx(edge.b);
    if (edge.kind === 'resistor') {
      const g = 1 / edge.value;
      if (i >= 0) A[i][i] += g;
      if (j >= 0) A[j][j] += g;
      if (i >= 0 && j >= 0) { A[i][j] -= g; A[j][i] -= g; }
    } else if (edge.kind === 'current_source') {
      if (i >= 0) b[i] -= edge.value;
      if (j >= 0) b[j] += edge.value;
    } else {
      const k = nodes.length + sources.indexOf(edge);
      if (i >= 0) { A[i][k] += 1; A[k][i] += 1; }
      if (j >= 0) { A[j][k] -= 1; A[k][j] -= 1; }
      b[k] = edge.value;
    }
  }
  const names = [...nodes.map((n) => `V(${n})`), ...sources.map((s) => `I(${s.id})`)];
  const equations = A.map((row, i) => equation(row, names, b[i]));
  const solution = solve(A, b);
  const voltages = Object.fromEntries([['GND', 0], ...nodes.map((name, i) => [name, solution[i]])]);
  const branches = edges.map((edge) => {
    const drop = voltages[edge.a] - voltages[edge.b];
    const current = edge.kind === 'resistor' ? drop / edge.value : edge.kind === 'current_source' ? edge.value : solution[nodes.length + sources.indexOf(edge)];
    return { id: edge.id, kind: edge.kind, from: edge.a, to: edge.b, current_A: current, voltage_drop_V: drop, absorbed_power_W: current * drop };
  });
  return { node_voltages_V: voltages, branches, equations, equation_units: [...nodes.map(() => 'A'), ...sources.map(() => 'V')], unknowns: names };
}

function mesh(prepared, nodalResult) {
  const { edges, nodeNames } = prepared;
  const parent = new Map(nodeNames.map((n) => [n, n]));
  const root = (n) => { while (parent.get(n) !== n) n = parent.get(n); return n; };
  const tree = [], chords = [];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const a = root(edge.a), b = root(edge.b);
    if (a === b) chords.push(i);
    else { parent.set(a, b); tree.push(i); }
  }
  if (new Set(nodeNames.map(root)).size !== 1) throw new Error('The circuit has disconnected groups of nets. Connect them or analyze each circuit separately.');
  const adjacency = new Map(nodeNames.map((n) => [n, []]));
  for (const i of tree) {
    adjacency.get(edges[i].a).push({ node: edges[i].b, edge: i, sign: 1 });
    adjacency.get(edges[i].b).push({ node: edges[i].a, edge: i, sign: -1 });
  }
  const count = chords.length;
  const B = Array.from({ length: edges.length }, () => Array(count).fill(0));
  const loops = [];
  chords.forEach((chord, k) => {
    const edge = edges[chord];
    B[chord][k] = 1;
    const start = edge.b, end = edge.a;
    const queue = [start], trail = new Map([[start, null]]);
    for (let head = 0; head < queue.length && !trail.has(end); head++) {
      for (const step of adjacency.get(queue[head])) if (!trail.has(step.node)) {
        trail.set(step.node, { previous: queue[head], edge: step.edge, sign: step.sign });
        queue.push(step.node);
      }
    }
    let node = end;
    while (node !== start) {
      const step = trail.get(node);
      B[step.edge][k] = step.sign;
      node = step.previous;
    }
    loops.push({ name: `L${k + 1}`, branches: edges.flatMap((e, i) => B[i][k] ? [{ id: e.id, direction: B[i][k] === 1 ? 'pin 1 to pin 2' : 'pin 2 to pin 1' }] : []) });
  });
  const currentSources = edges.map((e, i) => e.kind === 'current_source' ? i : -1).filter((i) => i >= 0);
  const size = count + currentSources.length;
  const A = Array.from({ length: size }, () => Array(size).fill(0));
  const b = Array(size).fill(0);
  for (let k = 0; k < count; k++) {
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i], sign = B[i][k];
      if (!sign) continue;
      if (edge.kind === 'resistor') for (let j = 0; j < count; j++) A[k][j] += sign * edge.value * B[i][j];
      else if (edge.kind === 'voltage_source') b[k] -= sign * edge.value;
      else A[k][count + currentSources.indexOf(i)] += sign;
    }
  }
  currentSources.forEach((i, s) => {
    for (let k = 0; k < count; k++) A[count + s][k] = B[i][k];
    b[count + s] = edges[i].value;
  });
  const names = [...loops.map((l) => `I(${l.name})`), ...currentSources.map((i) => `V(${edges[i].id})`)];
  const equations = A.map((row, i) => equation(row, names, b[i]));
  const solution = solve(A, b);
  const currents = Object.fromEntries(loops.map((loop, i) => [loop.name, solution[i]]));
  const branchCurrents = edges.map((edge, i) => B[i].reduce((sum, sign, j) => sum + sign * solution[j], 0));
  for (let i = 0; i < edges.length; i++) {
    if (Math.abs(branchCurrents[i] - nodalResult.branches[i].current_A) > 1e-9 + 1e-6 * Math.abs(nodalResult.branches[i].current_A)) {
      throw new Error('Loop-current result did not agree with node-voltage result. Check the circuit description.');
    }
  }
  return { loops, loop_currents_A: currents, equations, equation_units: [...loops.map(() => 'V'), ...currentSources.map(() => 'A')], unknowns: names };
}

export function analyzeDc(input, method = 'nodal') {
  if (!['nodal', 'mesh'].includes(method)) throw new Error('Method must be nodal or mesh.');
  const prepared = prepare(input);
  const node = nodal(prepared);
  const result = { title: prepared.title, method, assumptions: prepared.assumptions, node_voltages_V: node.node_voltages_V, branches: node.branches, power_balance_W: node.branches.reduce((sum, branch) => sum + branch.absorbed_power_W, 0) };
  if (method === 'nodal') return { ...result, unknowns: node.unknowns, equations: node.equations, equation_units: node.equation_units };
  return { ...result, ...mesh(prepared, node) };
}
