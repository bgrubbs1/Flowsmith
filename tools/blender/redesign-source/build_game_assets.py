"""Original compact playable-mill geometry authored with Blender. No external assets."""
import bpy, math,json
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[3]
bpy.ops.wm.read_factory_settings(use_empty=True)
PARTS={}
def register(o,name,bevel=0):
 o.name=name;PARTS.setdefault(name,[]).append(o)
 bpy.context.view_layer.objects.active=o
 if bevel:
  mod=o.modifiers.new('Soft manufactured edge','BEVEL');mod.width=bevel;mod.segments=1
  bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def box(name,size,pos,bevel=.00045):
 x,y,z=pos;w,h,d=size;bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,y));o=bpy.context.object;o.scale=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return register(o,name,bevel)
def cyl(name,r,depth,pos,axis='y',vertices=12):
 x,y,z=pos;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=(x,-z,y));o=bpy.context.object
 if axis=='x':o.rotation_euler.y=math.pi/2
 if axis=='z':o.rotation_euler.x=math.pi/2
 return register(o,name,0)
# Mill building stays inside one tile. Main silhouette is a real gable house, not an oversized wheel.
box('millWalls',(.031,.030,.036),(0,.015,0),.001)
box('millStone',(.035,.004,.040),(0,.002,0),.0005)
# Exposed timber corners and framed cream plaster panels.
for x in [-.0158,.0158]:
 for z in [-.0183,.0183]:box('millTimber',(.0018,.031,.0018),(x,.016,z),.0002)
for y in [.008,.027]:
 box('millTimber',(.033,.0017,.0015),(0,y,.0185),.0002)
 box('millTimber',(.0015,.0017,.037),(.016,y,0),.0002)
# Two pitched roof planes, long ridge aligned z.
for sign in [-1,1]:
 o=box('millRoof',(.0215,.002,.043),(sign*.0087,.036,0),.00035);o.rotation_euler.y=sign*math.radians(35)
for z in [-.016,-.008,0,.008,.016]:
 for sign in [-1,1]:
  o=box('millRoofSeams',(.0215,.0006,.0008),(sign*.0087,.0372,z),0);o.rotation_euler.y=sign*math.radians(35)
box('millTimber',(.0022,.0022,.044),(0,.0426,0),.0003)
# Chimney and cap.
box('millStone',(.0055,.013,.0065),(.009,.041,-.009),.0003)
box('millStone',(.007,.0018,.008),(.009,.048,-.009),.0003)
# Windows and front door use runtime causal window material.
box('millWindows',(.008,.010,.0006),(.006,.018,.0183),0)
box('millWindows',(.0006,.010,.008),(.0159,.018,.006),0)
box('millDoor',(.007,.014,.001),(-.007,.009,.0187),.0002)
for x in [.001,.011]:box('millTimber',(.0011,.012,.0012),(x,.018,.019),.0001)
for y in [.0125,.018,.0235]:box('millTimber',(.011,.001,.0012),(.006,y,.019),.0001)
# Wheel asset origin is its axle. Fewer faces and merged materials, 8 real wooden paddles.
for x in [-.006,.006]:
 bpy.ops.mesh.primitive_torus_add(major_radius=.0205,minor_radius=.0015,major_segments=24,minor_segments=4,location=(x,0,0),rotation=(0,math.pi/2,0));register(bpy.context.object,'wheelWood')
for k in range(8):
 a=k*math.pi/4
 # Blender world y is -game z and z is game y; wheel rotates on x axis.
 o=box('wheelWood',(.014,.002,.009),(0,math.sin(a)*.0205,math.cos(a)*.0205),.00025);o.rotation_euler.x=-a
 o=box('wheelWood',(.0025,.038,.002),(0,0,0),.0001);o.rotation_euler.x=a
cyl('wheelHub',.004,.018,(0,0,0),'x',12)
for x in [-.010,.010]:cyl('wheelHub',.005,.002,(x,0,0),'x',12)
# Decorative flange is a real open annulus, not a disk cap. 16 segments, axis game z.
verts=[];faces=[];segments=16
for z in [-.0018,.0018]:
 for r in [.0079,.011]:
  verts.extend([(r*math.cos(2*math.pi*k/segments),-z,r*math.sin(2*math.pi*k/segments)) for k in range(segments)])
for k in range(segments):
 j=(k+1)%segments
 for a,b in [(0,16),(16,48),(48,32),(32,0)]:faces.append((a+k,a+j,b+j,b+k))
m=bpy.data.meshes.new('flange');m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new('flange',m);bpy.context.collection.objects.link(o);register(o,'flange')
# Serialize merged world-space triangles with normals, preserving geometry authored in Blender.
result={};deps=bpy.context.evaluated_depsgraph_get()
for name,objs in PARTS.items():
 ps=[];ns=[]
 for o in objs:
  eo=o.evaluated_get(deps);mesh=eo.to_mesh();mesh.calc_loop_triangles();M=o.matrix_world;N=M.to_3x3().inverted().transposed()
  for tri in mesh.loop_triangles:
   for v in tri.vertices:
    p=M@mesh.vertices[v].co;n=(N@tri.normal).normalized()
    ps.extend([round(p.x,7),round(p.z,7),round(-p.y,7)]);ns.extend([round(n.x,6),round(n.z,6),round(-n.y,6)])
  eo.to_mesh_clear()
 result[name]={'position':ps,'normal':ns,'triangles':len(ps)//9}
(OUT/'src/view/blender-mill.json').write_text(json.dumps(result,separators=(',',':')))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'playable-mill-source.blend'))
print({k:v['triangles'] for k,v in result.items()})
