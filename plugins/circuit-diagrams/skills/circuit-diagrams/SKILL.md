---
name: circuit-diagrams
description: Draw basic electronic schematics and interpret uploaded circuit images or hand-drawn sketches by transcribing connections, redrawing them, and asking about uncertain details.
---

# Circuit diagrams

Use this workflow when the user asks to draw, read, explain, redraw, or analyze a basic circuit.

## Reading an image

1. Inspect the image for component symbols, values, labels, junction dots, and wire crossings. A crossing without a visible junction dot is not automatically a connection.
2. Build a list of components and named electrical nets. Use the same net name for pins that are visibly connected. Keep ambiguous crossings, obscured values, and uncertain symbol identities in `uncertainties`; do not silently choose a topology.
3. Call `render_circuit` with that transcription. Compare the redraw and returned net list to the original image. Correct any transcription errors you can resolve visually.
4. Ask a short, specific clarification for any unresolved detail that changes connectivity or polarity. Present the clean redraw as provisional until those details are settled.

## Numerical analysis

For a confirmed linear DC circuit, use `analyze_node_voltages` for KCL and modified nodal equations, or `analyze_mesh_currents` for independent loop currents and KVL equations. Include the circuit, reference ground, source polarities, equations, and units in the explanation. Branch current is positive from pin 1 to pin 2. A negative absorbed power means that branch supplies power.

For mesh analysis, name the exact loop branches returned by the tool. The tool finds a fundamental loop basis from the netlist; these loops need not match the visible face meshes in a particular drawing.

Numerical tools handle resistors, ideal batteries/voltage sources, ideal current sources, and ground. If the circuit contains an LED, diode, capacitor, inductor, or another unsupported part, request an appropriate model or state the analysis limit. Never invent a voltage drop or device parameter. Do not run numerical analysis while `uncertainties` contains an unresolved image detail.

## Drawing from a description

Translate the requested circuit into components and named nets, then call `render_circuit`. Space components at least 100 drawing units apart. If a requested connection is ambiguous, state the assumption near the drawing.

## Pin order and limits

- All two-pin parts list the net at pin 1, then the net at pin 2. For diodes and LEDs, pin 1 is anode and pin 2 is cathode. For batteries and voltage sources, pin 1 is positive. A current-source arrow points from pin 1 to pin 2.
- `ground` has one node. Supported symbols are resistor, capacitor, inductor, diode, LED, switch, voltage source, current source, battery, and ground.
- The connection checker finds structural issues. Numerical DC tools solve only their stated ideal-component model; they do not check physical safety or component ratings.
