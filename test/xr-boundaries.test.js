import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
// Execute exact deployed function bodies, without importing the WebGL startup side effects.
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function snapping(anchor=new THREE.Vector3(0,.82,0)) {
 const app={anchor:{position:anchor}};
 const body=source.slice(source.indexOf('function snapToTable('),source.indexOf("app.onEvent((e) => { if (e.type === 'recenter')"));
 return {anchor,run:new Function('THREE','app',body+';return snapToTable;')(THREE,app)};
}
function table(x,y,z,half=.2,rotation=0) {
 const matrix=new THREE.Matrix4().makeRotationY(rotation);matrix.setPosition(x,y,z);
 const plane={orientation:'horizontal',planeSpace:{},polygon:[{x:-half,z:-half},{x:half,z:-half},{x:half,z:half},{x:-half,z:half}]};
 const pose={transform:{position:{x,y,z},inverse:{matrix:matrix.clone().invert().elements}}};
 return {plane,pose};
}
function frame(...tables) {return {detectedPlanes:new Set(tables.map(t=>t.plane)),getPose:space=>tables.find(t=>t.plane.planeSpace===space)?.pose};}
it('no plane data, vertical planes and unavailable poses preserve placement',()=>{
 const {anchor,run}=snapping();run({},{});expect(anchor.y).toBe(.82);
 const t=table(0,.6,0);t.plane.orientation='vertical';run(frame(t),{});expect(anchor.y).toBe(.82);
 t.plane.orientation='horizontal';t.pose=null;run(frame(t),{});expect(anchor.y).toBe(.82);
});
it('large rotated table can contain the board despite a distant center',()=>{
 const {anchor,run}=snapping();run(frame(table(1,.6,0,2,Math.PI/4)),{});expect(anchor.y).toBeCloseTo(.781);
});
it('rejects floor and above-reach surfaces',()=>{
 const {anchor,run}=snapping();run(frame(table(0,.1,0),table(0,1.5,0)),{});expect(anchor.y).toBe(.82);
});
it('does not snap board height to an adjacent table whose polygon excludes the board',()=>{
 const {anchor,run}=snapping();run(frame(table(.4,.6,0,.1)),{});expect(anchor.y).toBe(.82);
});
it('overlapping table candidates choose nearest reachable height, independent of set order',()=>{
 const a=snapping(),b=snapping(),lower=table(0,.5,0),upper=table(0,.8,0);
 a.run(frame(lower,upper),{});b.run(frame(upper,lower),{});expect(a.anchor.y).toBeCloseTo(b.anchor.y);
 expect(a.anchor.y).toBeCloseTo(.821);
});
function sessionHarness({rejectRequest=false,rejectAttach=false,rejectEnd=false}={}) {
 const sessions=[],classes=new Set();let click;
 const app={passthroughAvailable:false,mode:'play',anchor:{position:new THREE.Vector3(0,.82,-.32),rotation:new THREE.Euler()},progress:{settings:{valley:false}}};
 const env={passthrough:false,setPassthrough(v){this.passthrough=v;},followAnchor:vi.fn()};
 const handViz={full:true},note={textContent:''};
 const renderer={setClearColor:vi.fn(),xr:{setSession:vi.fn(async()=>{if(rejectAttach)throw Error('attach failed');})}};
 const navigator={xr:{requestSession:vi.fn(async()=>{
  if(rejectRequest)throw Error('permission denied');
  const events={};const session={events,addEventListener:(n,f)=>events[n]=f,end:vi.fn(async()=>{if(rejectEnd)throw Error('end failed');events.end?.();}),updateTargetFrameRate:vi.fn(async()=>{})};sessions.push(session);return session;
 })}};
 const document={body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}};
 const enterBtn={addEventListener:(n,f)=>click=f},sound={start:vi.fn()};
 const applyWorld=()=>{env.setPassthrough(app.passthroughAvailable);handViz.full=!app.passthroughAvailable;};
 const body=source.slice(source.indexOf("enterBtn.addEventListener('click'"),source.indexOf('// Scripted capture for the demo video'));
 new Function('enterBtn','sound','navigator','app','env','handViz','renderer','document','note','applyWorld',"let mode='immersive-ar', recenterIn=-1, snapUntil=0;"+body)(enterBtn,sound,navigator,app,env,handViz,renderer,document,note,applyWorld);
 return {click,sessions,app,env,handViz,classes,note,renderer};
}
it('request rejection reports error and preserves non-XR state',async()=>{
 const h=sessionHarness({rejectRequest:true});await h.click();expect(h.note.textContent).toContain('permission denied');expect(h.env.passthrough).toBe(false);expect(h.classes.has('playing')).toBe(false);
});
it('successful session end restores scene and permits another session',async()=>{
 const h=sessionHarness();await h.click();expect(h.env.passthrough).toBe(true);expect(h.classes.has('playing')).toBe(true);
 await h.sessions[0].end();expect(h.env.passthrough).toBe(false);expect(h.handViz.full).toBe(true);expect(h.app.passthroughAvailable).toBe(false);expect(h.classes.has('playing')).toBe(false);
 await h.click();expect(h.sessions).toHaveLength(2);expect(h.env.passthrough).toBe(true);
});
it('renderer attach failure ends acquired session and rolls back passthrough',async()=>{
 const h=sessionHarness({rejectAttach:true});await h.click();expect(h.note.textContent).toContain('attach failed');
 expect(h.sessions[0].end).toHaveBeenCalled();expect(h.env.passthrough).toBe(false);expect(h.app.passthroughAvailable).toBe(false);expect(h.handViz.full).toBe(true);
});

it('attach failure still restores desktop if runtime rejects end',async()=>{
 const h=sessionHarness({rejectAttach:true,rejectEnd:true});await h.click();
 expect(h.sessions[0].events.end).toBeTypeOf('function');
 expect(h.env.passthrough).toBe(false);expect(h.handViz.full).toBe(true);expect(h.app.passthroughAvailable).toBe(false);expect(h.classes.has('playing')).toBe(false);
 expect(h.note.textContent).toContain('attach failed');
 // Subsequent attachment can succeed without leaked application state.
 h.renderer.xr.setSession.mockImplementation(async()=>{});await h.click();
 expect(h.sessions).toHaveLength(2);expect(h.classes.has('playing')).toBe(true);
});
it('missing or malformed outline uses nearby-center fallback without invalid math',()=>{
 for(const polygon of [undefined, [], [{x:0,z:0}], [{x:0,z:0},{x:1,z:0},{x:NaN,z:1}]]) {
  const t=table(.1,.6,0);t.plane.polygon=polygon;const {anchor,run}=snapping();run(frame(t),{});expect(anchor.y).toBeCloseTo(.781);
 }
});
it('nonfinite pose coordinates never poison board placement',()=>{
 const {anchor,run}=snapping();run(frame(table(0,NaN,0),table(Infinity,.6,0)),{});expect(anchor.y).toBe(.82);
});
it('session ending during renderer attach cannot re-enable playing on late resolution',async()=>{
 const h=sessionHarness();
 h.renderer.xr.setSession.mockImplementation(async session=>{await session.end();});
 await h.click();
 expect(h.classes.has('playing')).toBe(false);
 expect(h.env.passthrough).toBe(false);expect(h.app.passthroughAvailable).toBe(false);
 expect(h.note.textContent).toContain('ended');
});
