const TYPES = new Set(['resistor', 'capacitor', 'inductor', 'diode', 'led', 'switch', 'voltage_source', 'current_source', 'battery', 'ground']);
const SINGLE_PIN = new Set(['ground']);
const MAX_COMPONENTS = 40;

export function normalizeCircuit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Circuit must be an object.');
  if (!Array.isArray(input.components) || input.components.length === 0 || input.components.length > MAX_COMPONENTS) {
    throw new Error(`components must contain 1 to ${MAX_COMPONENTS} items.`);
  }
  const seen = new Set();
  const components = input.components.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`components[${index}] must be an object.`);
    const id = String(raw.id ?? '').trim();
    const kind = String(raw.kind ?? '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(id)) throw new Error(`components[${index}].id must be a short identifier starting with a letter.`);
    if (seen.has(id)) throw new Error(`Duplicate component id: ${id}.`);
    seen.add(id);
    if (!TYPES.has(kind)) throw new Error(`${id}: unsupported kind ${kind}.`);
    const x = Number(raw.x), y = Number(raw.y), rotation = Number(raw.rotation ?? 0);
    if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x > 2000 || y > 2000) throw new Error(`${id}: x and y must be numbers from 0 to 2000.`);
    if (![0, 90, 180, 270].includes(rotation)) throw new Error(`${id}: rotation must be 0, 90, 180, or 270.`);
    const expected = SINGLE_PIN.has(kind) ? 1 : 2;
    if (!Array.isArray(raw.nodes) || raw.nodes.length !== expected) throw new Error(`${id}: nodes must contain ${expected} net name${expected === 1 ? '' : 's'}.`);
    const nodes = raw.nodes.map((node) => String(node ?? '').trim());
    if (nodes.some((node) => !/^[A-Za-z0-9_+.-]{1,32}$/.test(node))) throw new Error(`${id}: each node needs a short net name.`);
    return { id, kind, x, y, rotation, nodes, value: String(raw.value ?? '').slice(0, 50) };
  });
  const uncertainties = Array.isArray(input.uncertainties) ? input.uncertainties.slice(0, 20).map((x) => String(x).slice(0, 180)) : [];
  return { title: String(input.title ?? 'Circuit diagram').slice(0, 80), components, uncertainties };
}

export function pinPositions(component) {
  const local = component.kind === 'ground' ? [[0, -30]] : [[-30, 0], [30, 0]];
  const angle = component.rotation * Math.PI / 180;
  const cos = Math.round(Math.cos(angle)), sin = Math.round(Math.sin(angle));
  return local.map(([x, y]) => ({ x: component.x + x * cos - y * sin, y: component.y + x * sin + y * cos }));
}

export function inspectCircuit(input) {
  const circuit = normalizeCircuit(input);
  const nets = new Map();
  const warnings = [];
  for (const component of circuit.components) {
    component.nodes.forEach((node, index) => {
      if (!nets.has(node)) nets.set(node, []);
      nets.get(node).push({ component: component.id, pin: index + 1 });
    });
    if (component.nodes.length === 2 && component.nodes[0] === component.nodes[1]) {
      warnings.push(`${component.id} has both terminals on ${component.nodes[0]}. Check for an accidental short.`);
    }
  }
  for (const [name, pins] of nets) {
    if (pins.length === 1 && !/^(GND|GROUND|0)$/i.test(name)) warnings.push(`${name} connects to only one terminal; it may be an intentional external connection or an open wire.`);
  }
  if (![...nets.keys()].some((name) => /^(GND|GROUND|0)$/i.test(name))) warnings.push('No ground/reference net is named; this may be intentional.');
  if (circuit.uncertainties.length) warnings.unshift('This redraw has unconfirmed details. Confirm the listed uncertainties before relying on the connectivity.');
  return {
    title: circuit.title,
    components: circuit.components.map(({ id, kind, value, nodes }) => ({ id, kind, value, nodes })),
    nets: [...nets].map(([name, pins]) => ({ name, pins })),
    uncertainties: circuit.uncertainties,
    warnings
  };
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function symbol(component) {
  const base = '<path d="M-30 0H-20 M20 0H30"/>';
  switch (component.kind) {
    case 'resistor': return `${base}<path d="M-20 0l5 -10 10 20 10 -20 10 20 5 -10"/>`;
    case 'capacitor': return '<path d="M-30 0H-6 M6 0H30 M-6 -15V15 M6 -15V15"/>';
    case 'inductor': return '<path d="M-30 0H-20 M20 0H30 M-20 0c0 -16 10 -16 10 0c0 -16 10 -16 10 0c0 -16 10 -16 10 0c0 -16 10 -16 10 0"/>';
    case 'diode': return `${base}<path d="M-14 -14V14L10 0Z M11 -15V15"/>`;
    case 'led': return `${base}<path d="M-14 -14V14L10 0Z M11 -15V15 M-2 -15l10 -11 m-6 0h6v6 M8 -12l10 -11 m-6 0h6v6"/>`;
    case 'switch': return '<path d="M-30 0H-16 M16 0H30 M-16 0L10 -14"/><circle cx="-16" cy="0" r="2"/><circle cx="16" cy="0" r="2"/>';
    case 'voltage_source': return '<path d="M-30 0H-18 M18 0H30"/><circle r="18"/><path d="M-7 -5H1 M-3 -9V-1 M-7 8H1"/>';
    case 'current_source': return '<path d="M-30 0H-18 M18 0H30"/><circle r="18"/><path d="M-9 0H8 M3 -5l5 5 -5 5"/>';
    case 'battery': return '<path d="M-30 0H-10 M10 0H30 M-10 -15V15 M-5 -9V9 M5 -15V15 M10 -9V9"/>';
    case 'ground': return '<path d="M0 -30V0 M-16 0H16 M-11 5H11 M-5 10H5"/>';
    default: throw new Error(`Unknown component kind: ${component.kind}`);
  }
}

export function renderSvg(input) {
  const circuit = normalizeCircuit(input);
  const pinsByNet = new Map();
  for (const component of circuit.components) {
    pinPositions(component).forEach((point, index) => {
      const net = component.nodes[index];
      if (!pinsByNet.has(net)) pinsByNet.set(net, []);
      pinsByNet.get(net).push(point);
    });
  }
  const all = circuit.components.flatMap((component) => [{ x: component.x - 45, y: component.y - 45 }, { x: component.x + 45, y: component.y + 45 }]);
  const minX = Math.min(...all.map((p) => p.x)), minY = Math.min(...all.map((p) => p.y));
  const maxX = Math.max(...all.map((p) => p.x)), maxY = Math.max(...all.map((p) => p.y));
  const width = Math.min(2400, Math.max(300, maxX - minX + 140));
  const height = Math.min(2400, Math.max(220, maxY - minY + 170 + (circuit.uncertainties.length ? 35 : 0)));
  const dx = 70 - minX, dy = 80 - minY;
  const wires = [];
  for (const [net, pins] of pinsByNet) {
    if (pins.length === 1) {
      const p = pins[0];
      wires.push(`<circle cx="${p.x}" cy="${p.y}" r="4" fill="white" stroke="#263d52"/>`);
      wires.push(`<text x="${p.x + 7}" y="${p.y - 7}" class="net">${esc(net)}</text>`);
      continue;
    }
    const sortedX = pins.map((p) => p.x).sort((a, b) => a - b);
    const sortedY = pins.map((p) => p.y).sort((a, b) => a - b);
    const busY = sortedY[Math.floor((sortedY.length - 1) / 2)];
    for (const p of pins) if (p.y !== busY) wires.push(`<path d="M${p.x} ${p.y}V${busY}"/>`);
    wires.push(`<path d="M${sortedX[0]} ${busY}H${sortedX[sortedX.length - 1]}"/>`);
    if (pins.length > 2) for (const p of pins) wires.push(`<circle cx="${p.x}" cy="${busY}" r="3.4" fill="#263d52" stroke="none"/>`);
    const labelX = sortedX[0] + (sortedX[sortedX.length - 1] - sortedX[0]) / 2;
    wires.push(`<text x="${labelX}" y="${busY - 8}" class="net" text-anchor="middle">${esc(net)}</text>`);
  }
  const symbols = circuit.components.map((c) => {
    const vertical = c.kind === 'ground' || c.rotation % 180 !== 0;
    const labelX = vertical ? c.x + 40 : c.x;
    const idY = vertical ? c.y - 6 : c.y - 34;
    const valueY = vertical ? c.y + 12 : c.y + 43;
    return `<g transform="translate(${c.x} ${c.y}) rotate(${c.rotation})">${symbol(c)}</g><text x="${labelX}" y="${idY}" class="id" text-anchor="${vertical ? 'start' : 'middle'}">${esc(c.id)}</text>${c.value ? `<text x="${labelX}" y="${valueY}" class="value" text-anchor="${vertical ? 'start' : 'middle'}">${esc(c.value)}</text>` : ''}`;
  }).join('');
  const subtitle = circuit.uncertainties.length ? 'UNCONFIRMED REDRAW — verify uncertain details below' : 'Schematic redraw · connections named by net';
  const details = circuit.uncertainties.length ? circuit.uncertainties.join(' · ').slice(0, 180) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(circuit.title)}"><style>text{font-family:Arial,sans-serif;fill:#20344a;stroke:none}.title{font-size:19px;font-weight:bold}.sub{font-size:11px;fill:#60788c}.id{font-size:13px;font-weight:bold}.value,.net{font-size:11px}.net{fill:#17688e}.wire{stroke:#263d52;stroke-width:2.4;fill:none;stroke-linecap:round;stroke-linejoin:round}.symbol{stroke:#13283b;stroke-width:2.4;fill:none;stroke-linecap:round;stroke-linejoin:round}</style><rect width="100%" height="100%" fill="#fff"/><text x="25" y="29" class="title">${esc(circuit.title)}</text><text x="25" y="47" class="sub">${esc(subtitle)}</text><g transform="translate(${dx} ${dy})"><g class="wire">${wires.join('')}</g><g class="symbol">${symbols}</g></g>${details ? `<text x="25" y="${height - 18}" class="sub">${esc(details)}</text>` : ''}</svg>`;
}
