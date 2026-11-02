import { STEP } from "./core/constants.js";
import { emptyFrame } from "./core/input.js";
import { createGame, update } from "./core/game.js";
import { createAudio } from "./ui/audio.js";
import { createDomInput } from "./ui/input-dom.js";
import { noteEvents, render } from "./ui/render.js";
import { loadInto, saveGame } from "./ui/storage.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const cover = new Image();
cover.src = "assets/cover.jpg";
const icon = new Image();
icon.src = "assets/icon.jpg";

const game = createGame({ seed: (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0 });
loadInto(game);

const audio = createAudio();
const dom = createDomInput(() => game.bindings);
const logical = { w: window.innerWidth, h: window.innerHeight, dpr: 1 };
let hotspots = [];
let pointer = null;
let acc = 0;
let last = performance.now();
let saved = "";

function resize() {
  logical.dpr = Math.min(2, window.devicePixelRatio || 1);
  logical.w = window.innerWidth;
  logical.h = window.innerHeight;
  canvas.width = Math.floor(logical.w * logical.dpr);
  canvas.height = Math.floor(logical.h * logical.dpr);
}

function pointerPos(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * logical.w,
    y: ((event.clientY - rect.top) / rect.height) * logical.h,
  };
}

window.addEventListener("resize", resize);
resize();
window.addEventListener("pointermove", (event) => {
  pointer = pointerPos(event);
});
canvas.addEventListener("pointerdown", (event) => {
  audio.unlock();
  const point = pointerPos(event);
  pointer = point;
  for (let i = hotspots.length - 1; i >= 0; i--) {
    const spot = hotspots[i];
    if (point.x >= spot.x && point.x <= spot.x + spot.w && point.y >= spot.y && point.y <= spot.y + spot.h) {
      dom.pushClick(spot.id);
      break;
    }
  }
});
window.addEventListener("keydown", () => audio.unlock());

function persist() {
  const snapshot = JSON.stringify({
    volume: game.volume,
    muted: game.muted,
    winsNeeded: game.winsNeeded,
    bindings: game.bindings,
  });
  if (snapshot === saved) return;
  saved = snapshot;
  saveGame(game);
}

function stepOnce(sample) {
  const events = update(game, STEP, sample);
  noteEvents(events, game.animTime);
  audio.consume(events, game);
}

function loop(now) {
  const debug = window.__FFF;
  if (!debug || !debug.pauseLoop) {
    let dt = (now - last) / 1000;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    last = now;
    acc += dt;
    const speed = Math.max(1, Math.min(48, Number(debug && debug.simSpeed) || 1));
    let sample = null;
    let ran = 0;
    while (acc >= STEP && ran < 5) {
      sample = sample ? { ...sample, keysDown: [], clicks: [] } : dom.sample();
      stepOnce(sample);
      acc -= STEP;
      ran += 1;
    }
    if (speed > 1) {
      const held = sample ? { ...sample, keysDown: [], clicks: [] } : dom.sample();
      for (let extra = 1; extra < speed; extra++) {
        stepOnce({ ...held, keysDown: [], clicks: [] });
      }
    }
  } else {
    last = now;
  }

  persist();
  ctx.setTransform(logical.dpr, 0, 0, logical.dpr, 0, 0);
  hotspots = render(ctx, logical.w, logical.h, game, { cover, icon }, pointer);
  const hovered = pointer && hotspots.some((spot) => pointer.x >= spot.x && pointer.x <= spot.x + spot.w && pointer.y >= spot.y && pointer.y <= spot.y + spot.h);
  canvas.style.cursor = hovered ? "pointer" : "default";
  requestAnimationFrame(loop);
}

window.__FFF = {
  get game() {
    return game;
  },
  update,
  emptyFrame,
  pauseLoop: false,
  simSpeed: 1,
};

requestAnimationFrame(loop);
