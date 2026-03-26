"""Blender CLI wrapper for headless rendering and file sanitisation."""

from __future__ import annotations

import asyncio
import os
import tempfile

from app.config import get_settings


async def sanitise_blend_file(input_path: str, output_path: str) -> str:
    """Remove embedded Python scripts from a .blend file.

    Runs Blender headlessly with a sanitisation script that removes
    all Text data blocks containing Python code.
    """
    settings = get_settings()

    # Write the sanitisation script to a temp file
    sanitise_script = '''
import bpy
for text in list(bpy.data.texts):
    if text.name.endswith('.py') or text.as_string().strip():
        bpy.data.texts.remove(text)
bpy.ops.wm.save_as_mainfile(filepath="{output}")
'''.format(output=output_path.replace('\\', '\\\\'))

    script_path = os.path.join(tempfile.gettempdir(), "sanitise.py")
    with open(script_path, "w") as f:
        f.write(sanitise_script)

    proc = await asyncio.create_subprocess_exec(
        settings.BLENDER_PATH,
        "--background", input_path,
        "--python", script_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(f"Blender sanitisation failed: {stderr.decode()}")

    return output_path


async def render_job(
    blend_file: str,
    output_dir: str,
    engine: str,
    frame_start: int,
    frame_end: int,
    resolution_x: int,
    resolution_y: int,
    output_format: str,
    samples: int | None = None,
    on_frame_done: callable | None = None,
) -> float:
    """Run a Blender render job. Returns total render time in seconds.

    Monitors stdout for frame completion and calls on_frame_done callback.
    """
    settings = get_settings()

    output_path = os.path.join(output_dir, "frame_####")

    cmd = [
        settings.BLENDER_PATH,
        "--background", blend_file,
        "--engine", "CYCLES" if engine == "cycles" else "BLENDER_EEVEE",
        "--render-output", output_path,
        "--render-format", output_format,
        "--frame-start", str(frame_start),
        "--frame-end", str(frame_end),
        "--render-anim",
        "-x", "1",  # use file extension
    ]

    # Set resolution via Python expression
    res_script = f'''
import bpy
bpy.context.scene.render.resolution_x = {resolution_x}
bpy.context.scene.render.resolution_y = {resolution_y}
bpy.context.scene.render.resolution_percentage = 100
'''
    if samples is not None:
        res_script += f'bpy.context.scene.cycles.samples = {samples}\n'

    script_path = os.path.join(tempfile.gettempdir(), "render_setup.py")
    with open(script_path, "w") as f:
        f.write(res_script)

    # Insert the python script before render args
    cmd_with_script = cmd[:3] + ["--python", script_path] + cmd[3:]

    import time
    start = time.monotonic()

    proc = await asyncio.create_subprocess_exec(
        *cmd_with_script,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Monitor output for frame completion
    frames_done = 0
    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        decoded = line.decode()
        if "Saved:" in decoded or "Fra:" in decoded:
            frames_done += 1
            if on_frame_done:
                await on_frame_done(frames_done)

    await proc.wait()
    elapsed = time.monotonic() - start

    if proc.returncode != 0:
        stderr_text = (await proc.stderr.read()).decode()
        raise RuntimeError(f"Blender render failed: {stderr_text}")

    return elapsed
