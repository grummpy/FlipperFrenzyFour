import { buildFrame } from "../core/input.js";

export function createDomInput(getBindings) {
  const held = new Set();
  const queue = [];
  const clicks = [];

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === "F5" || event.code === "F11" || event.code === "F12") return;
    event.preventDefault();
    if (!held.has(event.code)) queue.push(event.code);
    held.add(event.code);
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("gamepadconnected", () => pollPads());
  window.addEventListener("gamepaddisconnected", () => pollPads());

  function pollPads() {
    const source = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    return [0, 1, 2, 3].map((index) => {
      const pad = source ? source[index] : null;
      if (!pad || !pad.connected) return { connected: false, axes: [0, 0], buttons: [] };
      return {
        connected: true,
        axes: [pad.axes?.[0] || 0, pad.axes?.[1] || 0],
        buttons: Array.from(pad.buttons || []).map((button) => !!(button && (button.pressed || button.value > 0.5))),
      };
    });
  }

  function sample() {
    return buildFrame({
      heldKeys: held,
      keysDown: queue.splice(0, queue.length),
      clicks: clicks.splice(0, clicks.length),
      pads: pollPads(),
      bindings: getBindings(),
    });
  }

  function pushClick(id) {
    if (id) clicks.push(id);
  }

  return { sample, pushClick };
}
