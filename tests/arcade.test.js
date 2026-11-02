import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("arcade.json is valid and points at real files", () => {
  const arcade = JSON.parse(readFileSync(join(root, "arcade.json"), "utf8"));
  assert.equal(arcade.name, "Flipper Frenzy Four");
  assert.equal(arcade.id, "flipperfrenzyfour");
  assert.equal(arcade.players, 4);
  assert.equal(arcade.minPlayers, 1);
  assert.equal(arcade.port, 8817);
  assert.equal(arcade.version, "1.0.0");
  assert.deepEqual(arcade.input, ["keyboard", "gamepad"]);
  for (const relative of [arcade.icon, arcade.cover, arcade.launch.web, arcade.launch.windows]) {
    assert.equal(statSync(join(root, relative)).isFile(), true, relative);
  }
  for (const relative of [arcade.launch.mac, arcade.launch.linux]) {
    const path = join(root, relative.replace(/^\.\//, ""));
    const info = statSync(path);
    assert.equal(info.isFile(), true, relative);
    assert.ok(info.mode & 0o111, `${relative} should be executable`);
  }
});

test("the page, server, and launchers stay local", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /Flipper Frenzy Four/);
  assert.match(html, /src\/main\.js/);
  assert.match(html, /<canvas/);
  assert.doesNotMatch(html, /https?:\/\//);

  const server = readFileSync(join(root, "server.py"), "utf8");
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /arcade\.json/);

  for (const name of ["launch-linux.sh", "launch-mac.command", "launch-windows.bat"]) {
    const text = readFileSync(join(root, name), "utf8");
    assert.match(text, /python/i);
    assert.match(text, /server\.py/);
    assert.match(text, /Python 3 is required/);
  }
});
