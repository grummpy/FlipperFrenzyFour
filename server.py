#!/usr/bin/env python3
"""Serve Flipper Frenzy Four on localhost. No dependencies beyond Python 3."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"


def default_port() -> int:
    path = os.path.join(ROOT, "arcade.json")
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        return int(data.get("port", 8817))
    except (OSError, ValueError, TypeError):
        return 8817


def can_bind(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def pick_port(start: int) -> int:
    port = start
    for _ in range(40):
        if can_bind(port):
            return port
        port += 1
    raise SystemExit(f"No free port from {start} through {port - 1}.")


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve Flipper Frenzy Four")
    parser.add_argument("--port", type=int, default=None, help="Preferred port (default from arcade.json)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window")
    args = parser.parse_args(argv)

    start = args.port if args.port is not None else default_port()
    port = pick_port(start)
    if port != start:
        print(f"Port {start} is busy, using {port} instead.", flush=True)

    handler = partial(Handler, directory=ROOT)
    server = ThreadingHTTPServer((HOST, port), handler)
    url = f"http://{HOST}:{port}/"
    print(f"Flipper Frenzy Four running at {url}", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
