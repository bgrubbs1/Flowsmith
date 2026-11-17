# Original Blender source
Run these offline with Blender 5.2.4 LTS:

    blender --background --python tools/blender/redesign-source/build_game_assets.py
    blender --background --python tools/blender/redesign-source/bake_ceramic.py
    blender --background --python tools/blender/redesign-source/refine_landmark.py

They replace the corresponding private candidate outputs and save editable .blend sources. The landmark input is the preserved pre-redesign asset. No Blender MCP bridge or open network listener is required or enabled.

## Full material pass

`bake_industrial_materials.py` bakes seven original seamless procedural Cycles surfaces (colour, tangent normal, roughness), assigns physical-scale box UVs, and embeds the station PBR maps without adding triangles or material batches. It reads `landmark-pre-materials.glb`, preserving its vertex contact shading. `waterworks-pbr.blend` contains packed source images. Powered windows and water retain their original names and behaviour. It exports an explicit dark-brick factor after glTF export because the exporter does not preserve that particular node multiplier.

The playable-mill exporter now writes physically-scaled UVs; timber grain follows each component's longest projected axis. Texture coordinates do not change collision or interaction geometry. `copper_worked`, `brushed_brass`, and `oiled_timber` maps are also used by the runtime piece material slots. Texture dimensions are 256px except the reservoir's 512px colour/normal maps. All source surfaces were generated locally in Blender, not obtained from stock libraries or image synthesis.
