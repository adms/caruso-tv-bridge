#!/usr/bin/env python3
# Copyright (c) 2026 Adms Chung
# SPDX-License-Identifier: Apache-2.0
"""Local Apple TV activity helper; credentials never enter command arguments/output."""
import argparse
import asyncio
import ipaddress
import json
import os
from pathlib import Path
import sys

TITLE_URL = "https://www.netflix.com/title/70155589"

async def read_pairing_pin(timeout=180):
    """Wait a bounded time without leaving a blocked input thread on cancellation."""
    loop = asyncio.get_running_loop()
    result = loop.create_future()
    def ready():
        if not result.done():
            result.set_result(sys.stdin.readline().strip())
    loop.add_reader(sys.stdin.fileno(), ready)
    try:
        return await asyncio.wait_for(result, timeout)
    finally:
        loop.remove_reader(sys.stdin.fileno())

async def run(action, config_file):
    import pyatv
    from pyatv.const import Protocol
    from pyatv.storage.file_storage import FileStorage
    os.umask(0o077)
    options = json.loads(config_file.read_text())
    host = str(ipaddress.IPv4Address(options["host"]))
    if not ipaddress.ip_address(host).is_private:
        raise ValueError("Apple TV must be on the private network")
    storage_path = config_file.with_name("apple-tv-credentials.json")
    storage = FileStorage(str(storage_path), asyncio.get_running_loop())
    await storage.load()
    devices = await pyatv.scan(asyncio.get_running_loop(), hosts=[host],
                               protocol=Protocol.Companion, timeout=4, storage=storage)
    matches = [device for device in devices if device.name == options["name"]]
    if len(matches) != 1:
        raise RuntimeError("Configured Apple TV not found; no command sent")
    device = matches[0]
    service = device.get_service(Protocol.Companion)
    if action == "status":
        print(json.dumps({"found": True, "paired": bool(service.credentials)}))
        return
    if action == "pair":
        if service.credentials:
            print("Already paired; existing credentials preserved")
            return
        pairing = await pyatv.pair(device, Protocol.Companion, asyncio.get_running_loop(),
                                   storage=storage, name="Caruso Remote")
        try:
            await asyncio.wait_for(pairing.begin(), 15)
            print("PAIRING_REQUEST_SENT: waiting for user to confirm a visible TV PIN (180 seconds)", flush=True)
            pin = await read_pairing_pin()
            if len(pin) != 4 or not pin.isascii() or not pin.isdigit():
                raise ValueError("A four-digit TV pairing PIN is required")
            pairing.pin(pin)
            await asyncio.wait_for(pairing.finish(), 15)
            if not pairing.has_paired:
                raise RuntimeError("Apple TV did not confirm pairing")
            await storage.save()
            os.chmod(storage_path, 0o600)
            print("Paired successfully; credentials saved privately")
        finally:
            await pairing.close()
        return
    if not service.credentials:
        raise RuntimeError("First-time Apple TV remote pairing is required")
    atv = await pyatv.connect(device, asyncio.get_running_loop(), storage=storage)
    try:
        if action == "watch-community":
            from apple_tv_watch import watch
            async def reconnect():
                nonlocal atv
                await asyncio.gather(*atv.close(), return_exceptions=True)
                atv = await pyatv.connect(device, asyncio.get_running_loop(), storage=storage)
                return atv
            result = await asyncio.wait_for(watch(atv, config_file, options, reconnect), 150)
            print(json.dumps(result, ensure_ascii=False))
        elif action in ("open-community", "open-netflix"):
            await asyncio.wait_for(atv.power.turn_on(), 12)
            await asyncio.wait_for(atv.apps.launch_app(TITLE_URL if action == "open-community" else "com.netflix.Netflix"), 15)
            print(json.dumps({"requested": "community" if action == "open-community" else "netflix", "playbackConfirmed": False}))
            # Opening a title is not proof of playback. Never issue a blind Play/Select.
    finally:
        tasks = atv.close()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["status", "pair", "open-community", "open-netflix", "watch-community"])
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    try:
        asyncio.run(run(args.action, args.config))
    except (Exception, KeyboardInterrupt) as error:
        # Do not print protocol exceptions: upstream messages can include credentials.
        print("Apple TV activity failed (" + type(error).__name__ + "). No retry was sent.", file=sys.stderr)
        sys.exit(1)
