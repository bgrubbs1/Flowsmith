"""Flowsmith asset bake, run with Blender as a Python module (pip package `bpy`, Blender 5.x) or
`blender --background --python tools/blender/bake_assets.py -- <repo>`.

Produces, from source files kept in tools/blender/source:
  1. public/assets/flowsmith-waterworks-landmark.glb  - the landmark with Cycles-baked ambient
     occlusion in its vertex colours (crevices, eaves and the foot of the tower darken).
  2. public/assets/textures/*.jpg                       - albedo + tangent normal maps baked from
     procedural Blender materials: slate board tiles, oiled walnut plinth, felt tray.
  3. src/view/rockData.js                               - three sculpted boulders with AO and moss
     baked into vertex colours, as compact typed arrays (loaded synchronously, no fetch).
Everything is deterministic (fixed seeds) so a re-run reproduces the shipped files.
"""
import os, sys, math, random, struct, json
import bpy, bmesh
from mathutils import Vector, noise

REPO = os.path.abspath(sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(REPO, 'tools', 'blender', 'source')
TEX = os.path.join(REPO, 'public', 'assets', 'textures')
os.makedirs(TEX, exist_ok=True)
SAMPLES = int(os.environ.get('BAKE_SAMPLES', '96'))

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.render.bake.margin = 8
    sc.view_settings.view_transform = 'Standard'  # write baked values as-is, no filmic curve
    sc.view_settings.look = 'None'
    return sc

def new_image(name, size, non_color=False):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    if non_color: img.colorspace_settings.name = 'Non-Color'
    return img

def save(img, path, quality=88):
    sc = bpy.context.scene
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = quality
    img.save_render(path, scene=sc)
    print('wrote', os.path.relpath(path, REPO), os.path.getsize(path), 'bytes')

def bake_target(mat, img):
    nt = mat.node_tree
    for n in nt.nodes: n.select = False
    node = nt.nodes.new('ShaderNodeTexImage'); node.image = img; node.select = True; nt.nodes.active = node
    return node

def select_only(obj):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj

# ---------------------------------------------------------------- 1. landmark ambient occlusion
def bake_landmark():
    """Cycles AO baked per vertex into COLOR_0: brick courses, eaves, sills and the foot of the tower darken.
    Vertex colour multiplies the base colour in three.js, so it costs nothing at runtime (no texture, no shader)."""
    sc = reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'landmark-unbaked.glb'))
    meshes = [o for o in sc.objects if o.type == 'MESH']
    lo = min((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
    hi = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
    print('landmark height', round(hi - lo, 4))
    # Ground the model so the foot of every wall gets contact shadow (the plane is not exported).
    bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, lo - 0.0005))
    ground = bpy.context.active_object
    sc.world = bpy.data.worlds.new('w')
    sc.world.light_settings.distance = (hi - lo) * 0.22  # local occlusion, not "inside a box"
    sc.cycles.samples = max(SAMPLES, 128)
    for o in meshes:
        o.data.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
        o.data.color_attributes.active_color = o.data.color_attributes['ao']
    for o in bpy.context.view_layer.objects: o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for o in meshes:
        att = o.data.color_attributes['ao']
        for d in att.data:
            a = d.color[0]
            v = 0.32 + 0.68 * (a ** 1.4)  # keep the darkest crevice readable, push mid-tones
            d.color = (v, v, v, 1.0)
    bpy.data.objects.remove(ground)
    out = os.path.join(REPO, 'public', 'assets', 'flowsmith-waterworks-landmark.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                              export_normals=True, export_texcoords=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_materials='EXPORT', use_selection=False)
    print('wrote', os.path.relpath(out, REPO), os.path.getsize(out), 'bytes')

# ---------------------------------------------------------------- 2. procedural surfaces -> textures
def surface(name, build, size=512):
    """build(nt, bsdf) wires a procedural material. Bakes base colour and tangent normal on a unit plane."""
    sc = reset()
    bpy.ops.mesh.primitive_plane_add(size=1)
    plane = bpy.context.active_object
    m = bpy.data.materials.new(name); plane.data.materials.append(m)
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    build(nt, bsdf)
    sc.world = bpy.data.worlds.new('w')
    col = new_image(name + '_color', size); bake_target(m, col); select_only(plane)
    sc.cycles.samples = 8
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=0)
    save(col, os.path.join(TEX, name + '_color.jpg'))
    nrm = new_image(name + '_normal', size, non_color=True)
    for n in nt.nodes: n.select = False
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = nrm; t.select = True; nt.nodes.active = t
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=0)
    save(nrm, os.path.join(TEX, name + '_normal.jpg'), 92)

def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k.startswith('_'): setattr(n, k[1:], v)
        else: n.inputs[k].default_value = v
    return n

def ramp(nt, stops):
    r = nt.nodes.new('ShaderNodeValToRGB'); e = r.color_ramp.elements
    e[0].position, e[0].color = stops[0]; e[1].position, e[1].color = stops[-1]
    for pos, c in stops[1:-1]:
        el = e.new(pos); el.color = c
    return r

def slate(nt, bsdf):
    # Cleft slate: layered noise for colour, a raised pillow edge so each tile reads as a laid stone.
    tc = node(nt, 'ShaderNodeTexCoord')
    nz = node(nt, 'ShaderNodeTexNoise', Scale=6.0, Detail=9.0, Roughness=0.62); nz.noise_dimensions = '2D'
    nt.links.new(tc.outputs['UV'], nz.inputs['Vector'])
    vor = node(nt, 'ShaderNodeTexVoronoi', Scale=9.0); vor.feature = 'DISTANCE_TO_EDGE'
    nt.links.new(tc.outputs['UV'], vor.inputs['Vector'])
    col = ramp(nt, [(0.0, (0.035, 0.06, 0.075, 1)), (0.45, (0.075, 0.11, 0.125, 1)), (0.7, (0.12, 0.155, 0.16, 1)), (1.0, (0.2, 0.22, 0.21, 1))])
    nt.links.new(nz.outputs['Fac'], col.inputs['Fac'])
    # Pale mineral veins along voronoi edges.
    vein = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 0.018, 'To Min': 1.0, 'To Max': 0.0})
    nt.links.new(vor.outputs['Distance'], vein.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs[7].default_value = (0.32, 0.34, 0.31, 1)  # B (colour)
    vf = nt.nodes.new('ShaderNodeMath'); vf.operation = 'MULTIPLY'; vf.inputs[1].default_value = 0.14
    nt.links.new(vein.outputs['Result'], vf.inputs[0])
    nt.links.new(vf.outputs[0], mix.inputs[0]); nt.links.new(col.outputs['Color'], mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    # Pillow: distance to the tile border, eased, drives the bump with the cleft noise on top.
    sep = node(nt, 'ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['UV'], sep.inputs['Vector'])
    def edge(axis):
        a = nt.nodes.new('ShaderNodeMath'); a.operation = 'SUBTRACT'; a.inputs[1].default_value = 0.5
        nt.links.new(sep.outputs[axis], a.inputs[0])
        b = nt.nodes.new('ShaderNodeMath'); b.operation = 'ABSOLUTE'; nt.links.new(a.outputs[0], b.inputs[0]); return b
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'
    nt.links.new(edge('X').outputs[0], mx.inputs[0]); nt.links.new(edge('Y').outputs[0], mx.inputs[1])
    pil = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.5, 'From Max': 0.40, 'To Min': 0.0, 'To Max': 1.0}); pil.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(mx.outputs[0], pil.inputs['Value'])
    h = nt.nodes.new('ShaderNodeMath'); h.operation = 'MULTIPLY_ADD'; h.inputs[1].default_value = 0.08
    nt.links.new(nz.outputs['Fac'], h.inputs[0]); nt.links.new(pil.outputs['Result'], h.inputs[2])
    bump = node(nt, 'ShaderNodeBump', Strength=0.55, Distance=0.02)
    nt.links.new(h.outputs[0], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

def walnut(nt, bsdf):
    # Oiled walnut: stretched wave rings with fine pores.
    tc = node(nt, 'ShaderNodeTexCoord')
    mp = node(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.6, 3.4, 1.0)
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    wv = node(nt, 'ShaderNodeTexWave', Scale=1.6, Distortion=5.0, Detail=6.0, **{'Detail Scale': 0.9, 'Detail Roughness': 0.65}); wv.wave_type = 'RINGS'; wv.rings_direction = 'SPHERICAL'
    nt.links.new(mp.outputs['Vector'], wv.inputs['Vector'])
    col = ramp(nt, [(0.0, (0.04, 0.02, 0.011, 1)), (0.5, (0.07, 0.036, 0.019, 1)), (0.85, (0.10, 0.055, 0.03, 1)), (1.0, (0.125, 0.07, 0.038, 1))])
    nt.links.new(wv.outputs['Fac'], col.inputs['Fac']); nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    pores = node(nt, 'ShaderNodeTexNoise', Scale=120.0, Detail=2.0); nt.links.new(mp.outputs['Vector'], pores.inputs['Vector'])
    h = nt.nodes.new('ShaderNodeMath'); h.operation = 'MULTIPLY_ADD'; h.inputs[1].default_value = 0.25
    nt.links.new(pores.outputs['Fac'], h.inputs[0]); nt.links.new(wv.outputs['Fac'], h.inputs[2])
    bump = node(nt, 'ShaderNodeBump', Strength=0.25, Distance=0.01)
    nt.links.new(h.outputs[0], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

def felt(nt, bsdf):
    tc = node(nt, 'ShaderNodeTexCoord')
    nz = node(nt, 'ShaderNodeTexNoise', Scale=90.0, Detail=12.0, Roughness=0.7); nt.links.new(tc.outputs['UV'], nz.inputs['Vector'])
    col = ramp(nt, [(0.3, (0.025, 0.06, 0.07, 1)), (0.7, (0.05, 0.10, 0.11, 1))])
    nt.links.new(nz.outputs['Fac'], col.inputs['Fac']); nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    bump = node(nt, 'ShaderNodeBump', Strength=0.35, Distance=0.01)
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

# ---------------------------------------------------------------- 3. boulders with baked AO + moss
def boulders():
    sc = reset()
    random.seed(7)
    rocks = []
    for k in range(3):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
        off = Vector((k * 13.1, k * 7.7, k * 3.3))
        for v in bm.verts:
            p = v.co.copy()
            d = 0.28 * noise.fractal(p * 1.3 + off, 0.6, 2.1, 4) + 0.06 * noise.noise(p * 5 + off)
            # Flatten into a slab like water-worn stone, and plane off a few facets.
            v.co = p * (1 + d)
            v.co.z *= 0.62 + 0.08 * k
            v.co.x *= 1.15 - 0.1 * k
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(f'boulder{k}'); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(f'boulder{k}', me); sc.collection.objects.link(ob)
        ob.location.x = k * 4
        for p in me.polygons: p.use_smooth = True
        me.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
        rocks.append(ob)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(4, 0, -0.62))
    m = bpy.data.materials.new('r'); m.use_nodes = True
    for ob in rocks: ob.data.materials.append(m)
    sc.world = bpy.data.worlds.new('w')
    for ob in rocks:
        select_only(ob)
        ob.data.color_attributes.active_color = ob.data.color_attributes['ao']
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    out = []
    for ob in rocks:
        me = ob.data; me.calc_loop_triangles() if hasattr(me, 'calc_loop_triangles') else None
        ao = me.color_attributes['ao'].data
        pos, nor, col = [], [], []
        verts = me.vertices
        for v in verts:
            n = v.normal
            a = ao[v.index].color[0]
            # Lichen and moss gather on the upward, sheltered faces; lower faces are wet dark stone.
            moss = max(0.0, min(1.0, (n.z - 0.35) * 2.2)) * (0.55 + 0.45 * noise.noise(v.co * 3.1))
            base = Vector((0.062, 0.066, 0.072)) * (0.8 + 0.45 * noise.noise(v.co * 7.3 + Vector((3, 1, 2))))  # linear albedo
            green = Vector((0.028, 0.062, 0.018))
            c = base.lerp(green, max(0.0, min(1.0, moss))) * (0.35 + 0.65 * a)
            # Blender is z-up; the game is y-up.
            pos += [v.co.x, v.co.z, -v.co.y]; nor += [n.x, n.z, -n.y]; col += [c.x, c.y, c.z]
        idx = [i for t in me.loop_triangles for i in t.vertices]
        out.append({'pos': pos, 'nor': nor, 'col': col, 'idx': idx})
    q = lambda a, s: ','.join(str(round(x * s)) for x in a)
    # Colours are linear; store them gamma-encoded in a byte for precision in the darks (decoded in the game).
    js = ['// Generated by tools/blender/bake_assets.py (Blender ' + bpy.app.version_string + '): three sculpted boulders,',
          '// ambient occlusion and moss baked into vertex colours. Positions are unit-radius, quantised to 1/1000.',
          'export const BOULDERS = [']
    for r in out:
        js.append('  { pos: new Int16Array([' + q(r['pos'], 1000) + ']), nor: new Int8Array([' + q(r['nor'], 127) +
                  ']), col: new Uint8Array([' + q([c ** (1 / 2.2) for c in r['col']], 255) + ']), idx: new Uint16Array([' + ','.join(map(str, r['idx'])) + ']) },')
    js.append('];')
    path = os.path.join(REPO, 'src', 'view', 'rockData.js')
    open(path, 'w').write('\n'.join(js) + '\n')
    print('wrote', os.path.relpath(path, REPO), os.path.getsize(path), 'bytes', [len(r['idx']) // 3 for r in out], 'tris')

if __name__ == '__main__':
    only = os.environ.get('ONLY', 'landmark,slate,walnut,felt,boulders').split(',')
    if 'slate' in only: surface('slate_tile', slate)
    if 'walnut' in only: surface('walnut', walnut)
    if 'felt' in only: surface('felt', felt, 256)
    if 'boulders' in only: boulders()
    if 'landmark' in only: bake_landmark()
