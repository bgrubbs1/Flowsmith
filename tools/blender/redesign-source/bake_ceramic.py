import importlib.util,os,bpy
repo=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
s=importlib.util.spec_from_file_location('bake',repo+'/tools/blender/bake_assets.py');b=importlib.util.module_from_spec(s);s.loader.exec_module(b)
b.REPO=repo;b.TEX=repo+'/public/assets/textures'
def ceramic(nt,bsdf):
 tc=b.node(nt,'ShaderNodeTexCoord');nz=b.node(nt,'ShaderNodeTexNoise',Scale=5.0,Detail=3.0,Roughness=.65);nt.links.new(tc.outputs['UV'],nz.inputs['Vector'])
 col=b.ramp(nt,[(0,(.18,.27,.24,1)),(1,(.27,.37,.32,1))]);nt.links.new(nz.outputs['Fac'],col.inputs['Fac']);nt.links.new(col.outputs['Color'],bsdf.inputs['Base Color'])
 bump=b.node(nt,'ShaderNodeBump',Strength=.18,Distance=.008);nt.links.new(nz.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
b.surface('celadon_ceramic',ceramic,256)
bpy.ops.wm.save_as_mainfile(filepath=repo+'/celadon-source.blend')
