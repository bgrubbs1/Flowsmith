# Flowsmith

A hands-first waterworks puzzle designed for seated play in Meta Quest Browser, with a playable desktop mode. Build a miniature pipe network, balance competing mills, and bring a copper-and-slate pumping station to life.

## Play

**[Play Flowsmith now](https://bgrubbs1.github.io/Flowsmith/)**. The repository contains the source; GitHub Pages serves the playable game. Use a current WebXR-capable browser for headset mode or a desktop browser for mouse controls.

Start with **First Light**, **The Bend**, and **Easy Does It**. These introduce placement, rotation, and valve tuning. **Reconnect** combines those gestures. **The Night Shift** introduces shared pressure: restricting one branch changes the other mill's flow. Seven seeded advanced puzzles and a date-seeded Daily Flow follow.

The goal is to bring every mill into its marked target band without leaks. A pulsing warning ring with an exclamation mark identifies an open pipe end. Gauges also say **DRY**, **TOO SLOW**, **TOO FAST**, or **JUST RIGHT**. Water stays filled but stops streaming when flow is negligible. The station lights up when the complete network is valid.

### Tracked hands

- Choose **Enter (passthrough)**, or **Enter VR** when offered.
- Pinch a loose pipe, carry it to a socket, and release.
- Twist your wrist while holding a pipe to turn it. A quick pinch on a placed pipe turns it one quarter-turn.
- Pinch a red valve wheel and twist to tune its opening.
- Poke or pinch a physical button. Use **Hint** for guidance, **Reset** to restart, and **Next** after completing a puzzle.
- Use **Recenter** or the board's side handles to adjust placement. Remain comfortably seated and keep the real area clear.

### Desktop

- Choose **Play on desktop**. Drag a pipe from the tray to an empty socket.
- While holding a pipe, scroll or press **R** to rotate it.
- Hold a red valve and scroll to tune it.
- Use **Puzzles & records** to choose a stage. **Resume puzzle** returns from the level menu without discarding the current board. Choosing a level card starts that level again.

You earn a star for completing the network, another for completing it without hints, and another for precise flow. Personal bests are stored only in this browser. Scores are 1,000 per star plus 10 per accuracy point; time breaks ties. There are no accounts, online rankings, or fabricated opponents. Previously earned stars stay saved if you keep experimenting after a win; the live status changes to **Flow interrupted** if you break the network.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The landmark must be present at `public/assets/flowsmith-waterworks-landmark.glb`; it is included in the complete release source.

```sh
npm test
npm run build
npm run preview
```

## Implementation and validation

Built with Three.js, WebXR, Meta's Immersive Web Emulation Runtime, and a flow-network solver. The campaign contains three gesture lessons, two authored transition challenges, and seven reproducible generated puzzles. The original, texture-free landmark has 10,238 triangles and 11 material batches. Its essential geometry remains present in passthrough; the surrounding room does not.

The latest validated source suite has 45 tests across 12 files. Coverage includes solver invariants, generated-level solvability, shared-pressure counterexamples, placement and rotation, real IWER joint transforms passed through the hand-input code, local records, menu Resume, post-win break/repair, low-flow animation, powered material states, and recording interruptions. The production build passed. These tests do not establish physical Quest tracking, comfort, or headset frame rate.

A browser-emulator walkthrough demonstrates The Night Shift's pressure tradeoff and successful completion. It is scripted emulator footage, not footage recorded on Quest hardware. Real-device validation remains a separate requirement; no hardware performance claim is made.

## Recording a local emulator walkthrough

In the development server, open `?emulate&vr&director`, enter VR, then use the visible recording button. Add `&showcase` to record The Night Shift instead of the three lessons. The director moves emulated hands through the normal interaction system. It does not directly place solved board state.

The recorder has a 110-second bound and a **Stop & save partial** control. Keep the page open until the downloaded file is verified. Footage has a burned-in **SCRIPTED EMULATOR / NOT QUEST HARDWARE** label. Recording controls are development-only. Use these visible controls rather than the retained legacy browser-automation capture script.

## Assets and license

The pumping-station landmark is original code-authored geometry created for this project. Its soft contact shading is baked into vertex colours with Blender (Cycles ambient occlusion); the landmark's SHA-256 is `8856726efde63baf91f5c3fe73639efe72a7e91e448ca9c2a6cba5e0e8341bea` (668,780 bytes). The slate tiles, walnut and felt are also original, procedurally generated and baked in Blender by [`tools/blender/bake_assets.py`](tools/blender/bake_assets.py); no photo or third-party textures are used. Re-run it with the `bpy` Python module (`python -I tools/blender/bake_assets.py -- .`). Development and asset creation used AI assistance.

Project source and original project artwork: MIT, see [LICENSE](LICENSE). Dependencies retain their respective licenses; see [third-party notices](public/THIRD_PARTY_NOTICES.txt).

## Gameplay video

[Watch The Night Shift demo](https://www.youtube.com/watch?v=wGSmnWDv_BE). Genuine scripted emulator footage, not Quest hardware footage.
