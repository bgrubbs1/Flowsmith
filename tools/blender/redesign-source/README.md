# Original Blender source
Run these offline with Blender 5.2.4 LTS:

    blender --background --python tools/blender/redesign-source/build_game_assets.py
    blender --background --python tools/blender/redesign-source/bake_ceramic.py
    blender --background --python tools/blender/redesign-source/refine_landmark.py

They replace the corresponding private candidate outputs and save editable .blend sources. The landmark input is the preserved pre-redesign asset. No Blender MCP bridge or open network listener is required or enabled.
