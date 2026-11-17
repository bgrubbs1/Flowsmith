"""Original seamless PBR materials baked by Blender Cycles; applies UVs/maps to preserved station geometry."""
import bpy,math,os,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; TEX=ROOT/'public/assets/textures'
spec=importlib.util.spec_from_file_location('bake',ROOT/'tools/blender/bake_assets.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
b.REPO=str(ROOT);b.TEX=str(TEX)
def mathn(nt,op,a=None,c=None):
 n=b.node(nt,'ShaderNodeMath',_operation=op)
 if a is not None:nt.links.new(a,n.inputs[0])
 if c is not None:n.inputs[1].default_value=c
 return n.outputs[0]
def noise(nt,scale,detail=3,stretch=1):
 tc=b.node(nt,'ShaderNodeTexCoord');sep=b.node(nt,'ShaderNodeSeparateXYZ');nt.links.new(tc.outputs['UV'],sep.inputs[0]);u=mathn(nt,'MULTIPLY',sep.outputs['X'],math.tau);v=mathn(nt,'MULTIPLY',sep.outputs['Y'],math.tau)
 xyz=b.node(nt,'ShaderNodeCombineXYZ');nt.links.new(mathn(nt,'COSINE',u),xyz.inputs[0]);nt.links.new(mathn(nt,'SINE',u),xyz.inputs[1]);nt.links.new(mathn(nt,'MULTIPLY',mathn(nt,'COSINE',v),stretch),xyz.inputs[2])
 n=b.node(nt,'ShaderNodeTexNoise',_noise_dimensions='4D',Scale=scale,Detail=detail,Roughness=.65);nt.links.new(xyz.outputs[0],n.inputs['Vector']);nt.links.new(mathn(nt,'MULTIPLY',mathn(nt,'SINE',v),stretch),n.inputs['W']);return n.outputs['Fac']
SPECS={
 'copper_patina':([(0,(.07,.18,.16,1)),(.32,(.09,.24,.21,1)),(.52,(.11,.29,.22,1)),(.68,(.22,.19,.10,1)),(1,(.34,.25,.13,1))],2.0,.25,.45,.65),
 'copper_worked':([(0,(.20,.10,.045,1)),(.35,(.37,.18,.075,1)),(.65,(.52,.29,.14,1)),(1,(.62,.39,.22,1))],3,.28,.46,.62),
 'brushed_brass':([(0,(.31,.16,.045,1)),(.5,(.48,.29,.095,1)),(1,(.62,.41,.18,1))],3,.28,.48,.68),
 'fired_brick':([(0,(.20,.065,.036,1)),(.5,(.34,.12,.066,1)),(1,(.45,.19,.10,1))],3,.76,.95,0),
 'carved_limestone':([(0,(.37,.33,.24,1)),(.5,(.52,.46,.34,1)),(1,(.62,.56,.43,1))],3,.72,.9,0),
 'slate_roof':([(0,(.022,.045,.055,1)),(.5,(.045,.085,.10,1)),(1,(.075,.12,.13,1))],3,.48,.75,.15),
 'oiled_timber':([(0,(.065,.031,.012,1)),(.45,(.14,.07,.025,1)),(1,(.27,.15,.058,1))],2,.42,.7,0)
}
def build(name):
 stops,scale,lo,hi,metal=SPECS[name]
 def fn(nt,bsdf):
  coarse=noise(nt,scale,4,3 if name=='oiled_timber' else 1);fine=noise(nt,24,2,8 if name=='brushed_brass' else 2)
  ramp=b.ramp(nt,stops);nt.links.new(coarse,ramp.inputs['Fac']);nt.links.new(ramp.outputs['Color'],bsdf.inputs['Base Color'])
  rr=b.node(nt,'ShaderNodeMapRange',**{'From Min':0,'From Max':1,'To Min':lo,'To Max':hi});nt.links.new(fine,rr.inputs['Value']);nt.links.new(rr.outputs['Result'],bsdf.inputs['Roughness']);bsdf.inputs['Metallic'].default_value=metal
  bump=b.node(nt,'ShaderNodeBump',Strength=.22 if name in ['fired_brick','carved_limestone'] else .06,Distance=.002);nt.links.new(fine,bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
 return fn
for name in SPECS:
 b.surface(name,build(name),512 if name=='copper_patina' else 256)
 nt=bpy.context.active_object.active_material.node_tree;bs=nt.nodes['Principled BSDF'];out=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL');emit=b.node(nt,'ShaderNodeEmission');link=bs.inputs['Roughness'].links[0].from_socket;nt.links.new(link,emit.inputs['Color']);nt.links.new(emit.outputs[0],out.inputs['Surface']);img=b.new_image(name+'_roughness',256,True);b.bake_target(bpy.context.active_object.active_material,img);bpy.ops.object.bake(type='EMIT',margin=0);img.filepath_raw=str(TEX/(name+'_roughness.png'));img.file_format='PNG';img.save();img.filepath_raw=str(TEX/(name+'_roughness.jpg'));img.file_format='JPEG';img.save()
# Materials remain independent semantic names; emissive powered materials unchanged.
b.reset();bpy.ops.import_scene.gltf(filepath=str(ROOT/'tools/blender/redesign-source/landmark-pre-materials.glb'))
links={'copper_aged':'copper_patina','brass_trim':'brushed_brass','brick_warm':'fired_brick','brick_dark':'fired_brick','tower_brick':'fired_brick','stone_limestone':'carved_limestone','foundation_basalt':'slate_roof','roof_slate':'slate_roof'}
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 uv=o.data.uv_layers.new(name='IndustrialSurface') if not o.data.uv_layers else o.data.uv_layers.active
 # Dominant-face box projection in physical units. No mesh subdivisions or added draw calls.
 for poly in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in poly.loop_indices:
   co=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]]/.07,co[axes[1]]/.07)
for mat in bpy.data.materials:
 name=mat.name
 if name not in links:continue
 tex=links[name];nt=mat.node_tree;bs=nt.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Metallic'].default_value=SPECS[tex][-1]
 for key,suffix,inp in [('color','_color.jpg','Base Color'),('roughness','_roughness.png','Roughness')]:
  n=b.node(nt,'ShaderNodeTexImage');n.image=bpy.data.images.load(str(TEX/(tex+suffix)),check_existing=True);n.extension='REPEAT'
  if key=='roughness':n.image.colorspace_settings.name='Non-Color'
  nt.links.new(n.outputs['Color'],bs.inputs[inp])
 n=b.node(nt,'ShaderNodeTexImage');n.image=bpy.data.images.load(str(TEX/(tex+'_normal.jpg')),check_existing=True);n.image.colorspace_settings.name='Non-Color';nm=b.node(nt,'ShaderNodeNormalMap',Strength=.4);nt.links.new(n.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
 # Keep brick bond relief visible: the dark recessed brick batch is deliberately darker.
 if name=='brick_dark':
  col=bs.inputs['Base Color'].links[0].from_socket;mix=b.node(nt,'ShaderNodeMixRGB',_blend_type='MULTIPLY');mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.53,.53,.53,1);nt.links.new(col,mix.inputs[1]);nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/blender/redesign-source/waterworks-pbr.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/flowsmith-waterworks-landmark.glb'),export_format='GLB',export_apply=True,export_vertex_color='ACTIVE')
print('DONE', (ROOT/'public/assets/flowsmith-waterworks-landmark.glb').stat().st_size)

# Explicit glTF material factors preserve the intended dark recessed brick batch.
import json,struct
p=ROOT/'public/assets/flowsmith-waterworks-landmark.glb';raw=p.read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);tail=raw[20+jl:]
for m in doc['materials']:
 if m['name']=='brick_dark':m['pbrMetallicRoughness']['baseColorFactor']=[.53,.53,.53,1]
 if m['name']=='tower_brick':m['pbrMetallicRoughness']['baseColorFactor']=[.85,.85,.85,1]
buf=json.dumps(doc,separators=(',',':')).encode();buf+=b' ' *((-len(buf))%4);p.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(buf)+len(tail))+struct.pack('<II',len(buf),0x4e4f534a)+buf+tail)
