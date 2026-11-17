import bpy
from pathlib import Path
root=Path(__file__).resolve().parents[3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'tools/blender/redesign-source/landmark-baseline.glb'))
for o in bpy.context.scene.objects:
 if o.type!='MESH' or o.name not in ['copper_aged','foundation_basalt']:continue
 bpy.context.view_layer.objects.active=o
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.000001);bpy.ops.mesh.dissolve_limited(angle_limit=.001);bpy.ops.object.mode_set(mode='OBJECT')
 b=o.modifiers.new('Selective edge bevel','BEVEL');b.width=.0007;b.segments=1;b.limit_method='ANGLE';b.angle_limit=.5;bpy.ops.object.modifier_apply(modifier=b.name)
 if o.name=='copper_aged':
  for p in o.data.polygons:p.use_smooth=True
  m=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');m.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.export_scene.gltf(filepath=str(root/'public/assets/flowsmith-waterworks-landmark.glb'),export_format='GLB',export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'waterworks-selective-lowpoly.blend'))
