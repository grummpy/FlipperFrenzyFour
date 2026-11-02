import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionsFromGamepad,
  actionsFromKeys,
  applyDeadzone,
  buildFrame,
  defaultBindings,
  sanitizeBindings,
  setBinding,
} from "../src/core/input.js";

test("keyboard bindings map all four players", () => {
  const bindings = defaultBindings();
  const held = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG",
    "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Slash", "Period",
    "KeyI", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote",
    "Numpad8", "Numpad4", "Numpad5", "Numpad6", "Numpad0", "NumpadEnter",
  ]);
  const players = actionsFromKeys(held, bindings);
  assert.deepEqual(players[0], { moveX: 0, moveY: 0, action: true, secondary: true, pause: false });
  assert.equal(players[1].action, true);
  assert.equal(players[1].secondary, true);
  assert.equal(players[1].moveX, 0);
  assert.equal(players[1].moveY, 0);
  assert.equal(players[2].action, true);
  assert.equal(players[2].secondary, true);
  assert.equal(players[3].action, true);
  assert.equal(players[3].secondary, true);

  const p1 = actionsFromKeys(new Set(["KeyD", "KeyS", "KeyF"]), bindings)[0];
  assert.equal(p1.moveX, 1);
  assert.equal(p1.moveY, 1);
  assert.equal(p1.action, true);
  assert.equal(p1.secondary, false);

  const p2 = actionsFromKeys(new Set(["ArrowLeft", "Slash"]), bindings)[1];
  assert.equal(p2.moveX, -1);
  assert.equal(p2.action, true);

  const p4 = actionsFromKeys(new Set(["Numpad8", "Numpad4", "Numpad0"]), bindings)[3];
  assert.equal(p4.moveY, -1);
  assert.equal(p4.moveX, -1);
  assert.equal(p4.action, true);
});

test("gamepad stick, d-pad, A, B, and Start map to actions", () => {
  const buttons = Array(16).fill(false);
  buttons[0] = true;
  buttons[9] = true;
  buttons[14] = true;
  const fromDpad = actionsFromGamepad({ connected: true, axes: [0.9, 0.9], buttons });
  assert.equal(fromDpad.action, true);
  assert.equal(fromDpad.pause, true);
  assert.equal(fromDpad.moveX, -1);
  assert.equal(fromDpad.moveY, 0);

  const stick = actionsFromGamepad({
    connected: true,
    axes: [0.05, -0.95],
    buttons: Array(16).fill(false),
  });
  assert.equal(stick.moveX, 0);
  assert.equal(applyDeadzone(0.05), 0);
  assert.ok(stick.moveY < -0.5);

  const objectButtons = Array(16).fill(false);
  objectButtons[1] = { pressed: true, value: 1 };
  const secondary = actionsFromGamepad({ connected: true, axes: [0, 0], buttons: objectButtons });
  assert.equal(secondary.secondary, true);
  assert.equal(secondary.action, false);
});

test("a connected pad overrides that player's keyboard", () => {
  const buttons = Array(16).fill(false);
  buttons[1] = true;
  const frame = buildFrame({
    heldKeys: new Set(["KeyF", "KeyW"]),
    keysDown: ["KeyF"],
    pads: [{ connected: true, axes: [0, 0], buttons }],
  });
  assert.equal(frame.players[0].action, false);
  assert.equal(frame.players[0].secondary, true);
  assert.equal(frame.players[0].moveY, 0);
  assert.equal(frame.padsConnected[0], true);
  assert.equal(frame.padsConnected[1], false);
  assert.equal(frame.keysDown[0], "KeyF");
});

test("missing pad leaves the keyboard in control", () => {
  const frame = buildFrame({
    heldKeys: new Set(["KeyG"]),
    pads: [{ connected: false, axes: [1, 0], buttons: [true] }],
  });
  assert.equal(frame.players[0].secondary, true);
  assert.equal(frame.players[0].action, false);
  assert.equal(frame.padsConnected[0], false);
});

test("rebinding clears the previous owner of a key", () => {
  const bindings = defaultBindings();
  setBinding(bindings, 1, "action", "KeyF");
  assert.equal(bindings.players[1].action, "KeyF");
  assert.equal(bindings.players[0].action, null);
  const cleaned = sanitizeBindings({
    players: [{ up: "KeyQ" }, {}, {}, {}],
  });
  assert.equal(cleaned.players[0].up, "KeyQ");
  assert.equal(cleaned.players[0].down, "KeyS");
  assert.equal(sanitizeBindings(null).players[3].action, "Numpad0");
});
