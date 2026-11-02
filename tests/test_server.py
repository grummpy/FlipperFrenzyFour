#!/usr/bin/env python3
"""Smoke test: server.py serves the game on localhost."""

from __future__ import annotations

import importlib.util
import os
import socket
import subprocess
import sys
import time
import unittest
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_server():
    path = os.path.join(ROOT, "server.py")
    spec = importlib.util.spec_from_file_location("fff_server", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ServerTests(unittest.TestCase):
    def test_port_fallback(self):
        module = load_server()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        try:
            picked = module.pick_port(port)
        finally:
            sock.close()
        self.assertNotEqual(picked, port)
        self.assertGreater(picked, port)

    def test_serves_index_and_assets(self):
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        proc = subprocess.Popen(
            [sys.executable, "-u", "server.py", "--port", "8817", "--no-browser"],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
        try:
            url = None
            deadline = time.time() + 8
            while time.time() < deadline and url is None:
                line = proc.stdout.readline()
                if line and "http://" in line:
                    url = line.strip().split()[-1]
                    break
                if proc.poll() is not None:
                    err = proc.stderr.read()
                    self.fail(f"server exited {proc.returncode}: {err}")
            self.assertIsNotNone(url, "server did not print a URL")
            with urllib.request.urlopen(url, timeout=5) as response:
                body = response.read().decode("utf-8")
                self.assertEqual(response.status, 200)
                self.assertIn("Flipper Frenzy Four", body)
                self.assertIn("src/main.js", body)
            base = url.rstrip("/")
            for path in (
                "/src/main.js",
                "/src/core/game.js",
                "/arcade.json",
                "/assets/icon.jpg",
                "/assets/cover.jpg",
            ):
                with urllib.request.urlopen(base + path, timeout=5) as response:
                    payload = response.read()
                    self.assertEqual(response.status, 200)
                    self.assertGreater(len(payload), 20)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=3)
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()


if __name__ == "__main__":
    unittest.main()
