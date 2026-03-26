"""Render worker — polls for queued jobs and processes them."""

from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone
from glob import glob

from sqlalchemy import select, update

from app.database import get_session_factory
from app.lib.billing import calculate_render_cost, write_ledger_entry
from app.lib.blender import render_job
from app.lib.r2 import download_file, generate_signed_url, upload_file
from app.models import RenderJob


POLL_INTERVAL = 5  # seconds


async def process_job(job_id, blend_key, engine, frame_start, frame_end,
                       resolution_x, resolution_y, output_format, samples, user_id):
    """Process a single render job."""
    work_dir = tempfile.mkdtemp(prefix="render_")

    try:
        # 1. Mark as rendering
        async with get_session_factory()() as db:
            await db.execute(
                update(RenderJob)
                .where(RenderJob.id == job_id)
                .values(status="rendering", started_at=datetime.now(timezone.utc))
            )
            await db.commit()

        # 2. Download blend file from R2
        blend_path = os.path.join(work_dir, "scene.blend")
        download_file(blend_key, blend_path)

        output_dir = os.path.join(work_dir, "output")
        os.makedirs(output_dir, exist_ok=True)

        # 3. Frame progress callback
        async def on_frame_done(frames_done: int):
            async with get_session_factory()() as db:
                await db.execute(
                    update(RenderJob)
                    .where(RenderJob.id == job_id)
                    .values(frames_done=frames_done)
                )
                await db.commit()

        # 4. Run render
        render_seconds = await render_job(
            blend_file=blend_path,
            output_dir=output_dir,
            engine=engine,
            frame_start=frame_start,
            frame_end=frame_end,
            resolution_x=resolution_x,
            resolution_y=resolution_y,
            output_format=output_format,
            samples=samples,
            on_frame_done=on_frame_done,
        )

        # 5. Zip output and upload to R2
        output_files = glob(os.path.join(output_dir, "*"))
        zip_path = os.path.join(work_dir, "output.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in output_files:
                zf.write(f, os.path.basename(f))

        output_key = f"renders/{user_id}/{job_id}/output.zip"
        with open(zip_path, "rb") as f:
            upload_file(f, output_key, content_type="application/zip")

        # 6. Generate signed download URL
        download_url = generate_signed_url(output_key)
        download_expires = datetime.now(timezone.utc) + timedelta(days=7)

        # 7. Calculate cost and write ledger
        cost_nzd, kwh = calculate_render_cost(render_seconds)

        async with get_session_factory()() as db:
            await write_ledger_entry(
                db, user_id, -cost_nzd, "render_usage",
                description=f"Render job {job_id}: {render_seconds:.0f}s"
            )

            total_frames = frame_end - frame_start + 1
            await db.execute(
                update(RenderJob)
                .where(RenderJob.id == job_id)
                .values(
                    status="complete",
                    frames_done=total_frames,
                    render_seconds=render_seconds,
                    cost_nzd=cost_nzd,
                    output_key=output_key,
                    download_url=download_url,
                    download_expires=download_expires,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()

        print(f"Job {job_id} completed in {render_seconds:.1f}s, cost: ${cost_nzd:.4f}")

    except Exception as e:
        # Mark job as failed
        async with get_session_factory()() as db:
            await db.execute(
                update(RenderJob)
                .where(RenderJob.id == job_id)
                .values(
                    status="failed",
                    error_message=str(e),
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        print(f"Job {job_id} failed: {e}")

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


async def worker_loop():
    """Main worker loop — poll for queued jobs and process them."""
    print("Render worker started, polling for jobs...")

    while True:
        try:
            async with get_session_factory()() as db:
                result = await db.execute(
                    select(RenderJob)
                    .where(RenderJob.status == "queued")
                    .order_by(RenderJob.created_at.asc())
                    .limit(1)
                )
                job = result.scalar_one_or_none()

            if job:
                await process_job(
                    job_id=job.id,
                    blend_key=job.blend_file_key,
                    engine=job.engine,
                    frame_start=job.frame_start,
                    frame_end=job.frame_end,
                    resolution_x=job.resolution_x,
                    resolution_y=job.resolution_y,
                    output_format=job.output_format,
                    samples=job.samples,
                    user_id=job.user_id,
                )
            else:
                await asyncio.sleep(POLL_INTERVAL)

        except Exception as e:
            print(f"Worker error: {e}")
            await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(worker_loop())
