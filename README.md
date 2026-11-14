# Flowsmith

A seated tabletop pipe puzzle for Meta Quest Browser. Place pipes and turn valves with tracked hands to balance the flow through water mills. It uses three.js, WebXR, and a flow-network solver.

## Run locally

Requires Node.js 20 or newer.

```powershell
npm ci
npm run dev
```

Open the URL printed by Vite. On a desktop, drag pieces with the mouse and use the wheel or `R` to rotate. On a compatible headset, choose **Enter (passthrough)** or **Enter VR**. Add `?emulate` to the local URL for the Immersive Web Emulation Runtime preview.

## Verify

```powershell
npm test
npm run build
```

The tests cover the flow solver, generated levels, interactions, and a scripted hand-play demo. The scripted demo takes about two minutes. Automated emulation does not replace a test on a Meta Quest device.

## License

MIT. See [LICENSE](LICENSE).
