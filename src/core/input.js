/** Pure keyboard + gamepad mapping. No DOM. */

export const BIND_FIELDS = ["up", "down", "left", "right", "action", "secondary"];

const LABELS = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Slash: "/",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  NumpadEnter: "NumEnter",
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Backspace: "Bksp",
};

export function defaultBindings() {
  return {
    players: [
      { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", action: "KeyF", secondary: "KeyG" },
      { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", action: "Slash", secondary: "Period" },
      { up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL", action: "Semicolon", secondary: "Quote" },
      { up: "Numpad8", down: "Numpad5", left: "Numpad4", right: "Numpad6", action: "Numpad0", secondary: "NumpadEnter" },
    ],
  };
}

export function sanitizeBindings(data) {
  const bindings = defaultBindings();
  if (!data || !Array.isArray(data.players) || data.players.length !== 4) return bindings;
  for (let i = 0; i < 4; i++) {
    const src = data.players[i] || {};
    for (const field of BIND_FIELDS) {
      const value = src[field];
      if (typeof value === "string" && value.length > 0 && value.length < 40) {
        bindings.players[i][field] = value;
      }
    }
  }
  return bindings;
}

export function setBinding(bindings, playerIndex, field, code) {
  for (const player of bindings.players) {
    for (const key of BIND_FIELDS) {
      if (player[key] === code) player[key] = null;
    }
  }
  bindings.players[playerIndex][field] = code;
  return bindings;
}

export function bindingLabel(code) {
  if (!code) return "—";
  if (LABELS[code]) return LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num" + code.slice(6);
  return code;
}

function hasCode(held, code) {
  if (!code) return false;
  if (held && typeof held.has === "function") return held.has(code);
  if (Array.isArray(held)) return held.includes(code);
  return false;
}

export function actionsFromKeys(held, bindings) {
  return bindings.players.map((player) => {
    const left = hasCode(held, player.left);
    const right = hasCode(held, player.right);
    const up = hasCode(held, player.up);
    const down = hasCode(held, player.down);
    return {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      moveY: (down ? 1 : 0) - (up ? 1 : 0),
      action: hasCode(held, player.action),
      secondary: hasCode(held, player.secondary),
      pause: false,
    };
  });
}

export const STICK_DEADZONE = 0.28;

export function applyDeadzone(v) {
  if (!Number.isFinite(v) || Math.abs(v) < STICK_DEADZONE) return 0;
  const sign = Math.sign(v);
  const scaled = (Math.abs(v) - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  return sign * Math.max(0, Math.min(1, scaled));
}

function buttonDown(buttons, index) {
  const value = buttons?.[index];
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") return !!(value.pressed || value.value > 0.5);
  return !!value;
}

/** Standard mapping: A=0, B=1, Start=9, D-pad=12..15. Stick axes 0 and 1. */
export function actionsFromGamepad(pad) {
  const buttons = pad?.buttons || [];
  const axes = pad?.axes || [0, 0];
  const dpadUp = buttonDown(buttons, 12);
  const dpadDown = buttonDown(buttons, 13);
  const dpadLeft = buttonDown(buttons, 14);
  const dpadRight = buttonDown(buttons, 15);
  let moveX = 0;
  let moveY = 0;
  if (dpadUp || dpadDown || dpadLeft || dpadRight) {
    moveX = (dpadRight ? 1 : 0) - (dpadLeft ? 1 : 0);
    moveY = (dpadDown ? 1 : 0) - (dpadUp ? 1 : 0);
  } else {
    moveX = applyDeadzone(axes[0] || 0);
    moveY = applyDeadzone(axes[1] || 0);
  }
  return {
    moveX,
    moveY,
    action: buttonDown(buttons, 0),
    secondary: buttonDown(buttons, 1),
    pause: buttonDown(buttons, 9),
  };
}

export function emptyPlayerAction() {
  return { moveX: 0, moveY: 0, action: false, secondary: false, pause: false };
}

export function emptyFrame() {
  return {
    players: [emptyPlayerAction(), emptyPlayerAction(), emptyPlayerAction(), emptyPlayerAction()],
    keysDown: [],
    clicks: [],
    padsConnected: [false, false, false, false],
  };
}

/**
 * Build a simulation frame.
 * A connected pad fully replaces that player's keyboard bindings.
 */
export function buildFrame({ heldKeys = new Set(), keysDown = [], pads = [], clicks = [], bindings }) {
  const map = bindings || defaultBindings();
  const keyboard = actionsFromKeys(heldKeys, map);
  const players = [0, 1, 2, 3].map((index) => {
    const pad = pads[index];
    if (pad && pad.connected) return actionsFromGamepad(pad);
    return keyboard[index];
  });
  return {
    players,
    keysDown: keysDown.slice(),
    clicks: clicks.slice(),
    padsConnected: [0, 1, 2, 3].map((index) => !!(pads[index] && pads[index].connected)),
  };
}
