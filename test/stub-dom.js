// Minimal canvas/document stand-ins so the 3D scene can be built and driven in Node (no rendering).
const ctx = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s).length * 20 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
class FakeCanvas { constructor() { this.width = 1; this.height = 1; this.style = {}; } getContext() { return ctx; } addEventListener() {} }
globalThis.document = { createElement: () => new FakeCanvas(), createElementNS: () => new FakeCanvas() };
globalThis.window = globalThis.window || { addEventListener() {} };
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
