import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = join(repo, 'plugins', 'circuit-diagrams');
const config = {
  mcpServers: {
    'circuit-diagrams': {
      command: process.execPath,
      args: [join(plugin, 'server.mjs')],
      enabled: true
    }
  }
};
writeFileSync(join(plugin, '.mcp.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
process.stdout.write(`Created local MCP configuration at ${join(plugin, '.mcp.json')}\n`);
