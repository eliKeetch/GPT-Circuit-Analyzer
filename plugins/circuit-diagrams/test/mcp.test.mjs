import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP exposes drawing tools and returns a PNG redraw', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['server.mjs'] });
  const client = new Client({ name: 'circuit-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.ok(list.tools.some((tool) => tool.name === 'render_circuit'));
    assert.ok(list.tools.some((tool) => tool.name === 'analyze_node_voltages'));
    assert.ok(list.tools.some((tool) => tool.name === 'analyze_mesh_currents'));
    const result = await client.callTool({ name: 'render_circuit', arguments: { circuit: {
      title: 'Simple source and load',
      components: [
        { id: 'V1', kind: 'voltage_source', x: 80, y: 150, rotation: 90, nodes: ['VCC', 'GND'], value: '5 V' },
        { id: 'R1', kind: 'resistor', x: 230, y: 80, nodes: ['VCC', 'GND'], value: '1 kΩ' }
      ]
    } } });
    assert.equal(result.isError, undefined);
    const image = result.content.find((part) => part.type === 'image');
    assert.equal(image?.mimeType, 'image/png');
    assert.ok(Buffer.from(image.data, 'base64').length > 1000);
    const analysis = await client.callTool({ name: 'analyze_node_voltages', arguments: { circuit: {
      components: [
        { id: 'V1', kind: 'voltage_source', x: 80, y: 150, nodes: ['VIN', 'GND'], value: '10V' },
        { id: 'R1', kind: 'resistor', x: 230, y: 80, nodes: ['VIN', 'GND'], value: '1kΩ' }
      ]
    } } });
    assert.equal(analysis.isError, undefined);
    assert.equal(analysis.structuredContent.node_voltages_V.VIN, 10);
  } finally {
    await client.close();
  }
});
