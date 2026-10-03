import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { z } from 'zod';
import sharp from 'sharp';
import { inspectCircuit, renderSvg } from './circuit.mjs';
import { analyzeDc } from './analysis.mjs';

const componentSchema = z.object({
  id: z.string().describe('Unique component reference, such as R1 or V1.'),
  kind: z.enum(['resistor', 'capacitor', 'inductor', 'diode', 'led', 'switch', 'voltage_source', 'current_source', 'battery', 'ground']),
  x: z.number().describe('Horizontal position in drawing units, 0 to 2000.'),
  y: z.number().describe('Vertical position in drawing units, 0 to 2000.'),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional().describe('Clockwise rotation in degrees.'),
  nodes: z.array(z.string()).describe('One net for ground; two nets in pin order for other components. Use exactly the same name for connected pins.'),
  value: z.string().optional().describe('Visible value or part label, such as 10kΩ or 9V.')
});

const circuitSchema = z.object({
  title: z.string().optional(),
  components: z.array(componentSchema).min(1).max(40),
  uncertainties: z.array(z.string()).optional().describe('For image transcriptions, list every connection, component, or value that cannot be read confidently. Never silently guess.')
});

function makeServer() {
  const server = new McpServer(
    { name: 'circuit-diagrams', version: '0.1.0' },
    { instructions: 'For an uploaded circuit image, transcribe visible components and wire connectivity into a circuit object. Put uncertain details in uncertainties, then call render_circuit to inspect a clean redraw. Resolve consequential uncertainties before numerical analysis. A shared net name means an electrical connection. Diode/LED pin 1 is anode and pin 2 cathode; voltage-source pin 1 is positive; current-source arrow runs pin 1 to pin 2. Use analysis tools only for confirmed linear DC circuits.' }
  );

  server.registerTool('render_circuit', {
    title: 'Draw or redraw a circuit',
    description: 'Draw a basic schematic from a component and net list. Also use after visually reading an uploaded or hand-drawn diagram to make a clean redraw. Include uncertain readings in uncertainties. Returns a PNG diagram and connectivity summary.',
    inputSchema: { circuit: circuitSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async ({ circuit }) => {
    try {
      const summary = inspectCircuit(circuit);
      const svg = renderSvg(circuit);
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      return {
        structuredContent: summary,
        content: [
          { type: 'text', text: JSON.stringify(summary) },
          { type: 'image', data: png.toString('base64'), mimeType: 'image/png' }
        ]
      };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Circuit could not be drawn: ${error.message}` }] };
    }
  });

  server.registerTool('check_circuit', {
    title: 'Check circuit connections',
    description: 'Review a transcribed or drafted basic circuit for component pin order, net membership, isolated pins, same-net terminals, and unresolved image uncertainties. This is a structural check, not electrical simulation.',
    inputSchema: { circuit: circuitSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async ({ circuit }) => {
    try {
      const summary = inspectCircuit(circuit);
      return { structuredContent: summary, content: [{ type: 'text', text: JSON.stringify(summary) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Circuit could not be checked: ${error.message}` }] };
    }
  });

  server.registerTool('analyze_node_voltages', {
    title: 'Run node-voltage analysis',
    description: 'Solve a confirmed linear DC circuit with resistors, ideal batteries/voltage sources, ideal current sources, and a ground reference using modified nodal analysis. Returns node voltages, branch currents, absorbed power, and equations. Does not model LEDs, diodes, capacitors, inductors, or uncertain image details.',
    inputSchema: { circuit: circuitSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async ({ circuit }) => {
    try {
      const result = analyzeDc(circuit, 'nodal');
      return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Node-voltage analysis stopped: ${error.message}` }] };
    }
  });

  server.registerTool('analyze_mesh_currents', {
    title: 'Run mesh or loop-current analysis',
    description: 'Find independent loop currents and KVL equations for a confirmed linear DC circuit with resistors and ideal sources. Also returns node voltages and branch currents for cross-checking. Current sources are handled by loop-current constraints. Report the generated loops explicitly; a fundamental loop may not match a hand-drawn face mesh.',
    inputSchema: { circuit: circuitSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async ({ circuit }) => {
    try {
      const result = analyzeDc(circuit, 'mesh');
      return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Loop-current analysis stopped: ${error.message}` }] };
    }
  });

  server.registerTool('example_circuit', {
    title: 'Get a circuit example',
    description: 'Show the expected circuit format using a 9 V LED circuit with a series resistor.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async () => ({
    content: [{ type: 'text', text: JSON.stringify({ title: '9 V LED circuit', components: [
      { id: 'V1', kind: 'battery', x: 80, y: 150, rotation: 90, nodes: ['VCC', 'GND'], value: '9 V' },
      { id: 'R1', kind: 'resistor', x: 230, y: 80, nodes: ['VCC', 'LED_A'], value: '1 kΩ' },
      { id: 'D1', kind: 'led', x: 380, y: 80, nodes: ['LED_A', 'GND'], value: 'red LED' },
      { id: 'G1', kind: 'ground', x: 80, y: 270, nodes: ['GND'] }
    ] }) }]
  }));
  return server;
}

if (process.argv.includes('--http')) {
  const app = createMcpExpressApp();
  app.post('/mcp', async (req, res) => {
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  app.get('/health', (_req, res) => res.json({ ok: true }));
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  app.listen(port, host, () => console.log(`Circuit MCP server listening on ${host}:${port}/mcp`));
} else {
  const server = makeServer();
  await server.connect(new StdioServerTransport());
}
