# Circuit Diagrams plugin

This repository contains a circuit diagram plugin for ChatGPT and Codex. It redraws basic schematics, checks connections, and solves linear DC circuits with node-voltage or loop-current analysis. Uploaded images are interpreted by the assistant; unclear wires or values are flagged for confirmation before numerical analysis.

## Share it with another account

The repository shares the **source**. A GitHub URL alone does not host the MCP server or make the plugin callable from ChatGPT on the web. There are two setup paths:

### Local desktop setup

1. Clone this repository on the recipient's computer. Install Node.js 20 or newer and Codex CLI.
2. In `plugins/circuit-diagrams`, run `npm ci`.
3. From the repository root, run `node scripts/setup-local.mjs`. This writes a local `.mcp.json` with paths for that computer; it is ignored by Git.
4. From the repository root, run `codex plugin marketplace add .` and `codex plugin add circuit-diagrams@circuit-diagrams-share`.
5. Restart the ChatGPT desktop app and install or enable **Circuit Diagrams** from the plugin directory. Start a new chat to pick up the tools.

The desktop setup uses a local stdio MCP server. Availability of local MCP tools in ChatGPT Chat can vary by surface; Codex can use this configuration locally. For regular ChatGPT on the web, use the hosted setup below.

### Hosted ChatGPT setup

1. Deploy `plugins/circuit-diagrams/Dockerfile` to a container host with a stable HTTPS address. Route `POST /mcp` to container port 3000.
2. In each ChatGPT account that will use the tools, turn on Developer mode and register the HTTPS `/mcp` endpoint as an MCP plugin connection.
3. Install the resulting personal plugin and test with: “Draw a 10 V, two 1 kΩ resistor divider and find the midpoint voltage.”

The server is currently stateless and has no user data or authentication. A publicly reachable deployment should have an access policy, rate limits, and monitoring appropriate for its audience. The source can be shared through a private GitHub repository with selected people or a public repository if you want anyone to copy it. To publish a single installable listing for everyone in ChatGPT, submit a plugin to OpenAI's public directory after hosting and review.

## What it analyzes

- Resistors, ideal voltage sources, batteries, ideal current sources, and ground in linear DC circuits.
- Node voltages, independent loop currents, branch currents, power, and the equations used.
- It pauses numerical analysis when an uploaded diagram has unresolved connections or when a device needs a missing model, such as an LED or diode.

Run `npm test` in `plugins/circuit-diagrams` to verify the solver and MCP tools.
