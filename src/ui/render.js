import { BIND_FIELDS, bindingLabel } from "../core/input.js";
import { CENTER, DRAIN_HALF, START_LIVES, TABLE } from "../core/constants.js";
import { standings } from "../core/game.js";
import { flipperEndpoints } from "../core/table.js";

const COLORS = ["#ffb000", "#00e5ff", "#ff4d8d", "#b6ff4a"];
const INK = "#f6f1e6";
const MUTED = "#b7adc8";

const sparks = [];

export function noteEvents(events, time) {
  for (const event of events) {
    if (event.x == null || event.y == null) continue;
    if (event.type !== "bumper" && event.type !== "flip" && event.type !== "drain" && event.type !== "power" && event.type !== "spin") {
      continue;
    }
    const count = event.type === "drain" ? 14 : 7;
    for (let i = 0; i < count; i++) {
      sparks.push({
        x: event.x,
        y: event.y,
        angle: (i / count) * Math.PI * 2 + time,
        speed: event.type === "drain" ? 90 + i * 8 : 50 + i * 10,
        life: event.type === "drain" ? 0.45 : 0.28,
        born: time,
        color: event.type === "power" ? "#ffe27a" : event.player != null ? COLORS[event.player] : "#fff4d2",
      });
    }
  }
  while (sparks.length > 120) sparks.shift();
}

export function render(ctx, width, height, game, assets, pointer) {
  const hotspots = [];
  ctx.clearRect(0, 0, width, height);
  paintBackground(ctx, width, height);

  if (game.phase === "title") {
    drawTitle(ctx, width, height, game, assets, hotspots);
  } else if (game.phase === "join" || (game.phase === "settings" && game.returnPhase === "join") || (game.phase === "controls" && game.returnPhase === "join")) {
    drawJoin(ctx, width, height, game, hotspots);
  } else if (game.phase === "matchEnd") {
    drawMatch(ctx, width, height, game, hotspots);
  } else {
    const view = tableView(width, height);
    ctx.save();
    if (game.shake > 0) {
      ctx.translate(Math.sin(game.animTime * 74) * game.shake * 16, Math.cos(game.animTime * 57) * game.shake * 12);
    }
    drawTable(ctx, game, view);
    drawSparks(ctx, game, view);
    ctx.restore();
    drawHud(ctx, width, height, game, view);
    if (game.phase === "countdown" || (game.phase === "playing" && game.roundTime < 0.55)) {
      drawCountdown(ctx, width, height, game);
    }
    if (game.phase === "roundEnd") drawRoundBanner(ctx, width, height, game);
    if (game.phase === "paused") drawPause(ctx, width, height, game, hotspots, pointer);
  }

  if (game.phase === "settings") drawSettings(ctx, width, height, game, hotspots, pointer);
  if (game.phase === "controls") drawControls(ctx, width, height, game, hotspots);
  if (game.message && game.messageTimer > 0 && game.phase === "join") {
    drawToast(ctx, width, height, game.message);
  }
  drawMute(ctx, width, game);
  return hotspots;
}

function paintBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#141226");
  gradient.addColorStop(1, "#07060f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawTitle(ctx, width, height, game, assets, hotspots) {
  const cover = assets.cover;
  if (cover && cover.complete && cover.naturalWidth) {
    const scale = Math.max(width / cover.naturalWidth, height / cover.naturalHeight);
    const dw = cover.naturalWidth * scale;
    const dh = cover.naturalHeight * scale;
    ctx.drawImage(cover, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }
  ctx.fillStyle = "rgba(5, 4, 12, 0.62)";
  ctx.fillRect(0, 0, width, height);
  const veil = ctx.createLinearGradient(0, height * 0.15, 0, height);
  veil.addColorStop(0, "rgba(5, 4, 12, 0.1)");
  veil.addColorStop(1, "rgba(5, 4, 12, 0.82)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);

  const icon = assets.icon;
  if (icon && icon.complete && icon.naturalWidth) {
    const size = Math.min(84, width * 0.1);
    roundRect(ctx, width / 2 - size / 2, height * 0.16, size, size, 12);
    ctx.save();
    ctx.clip();
    ctx.drawImage(icon, width / 2 - size / 2, height * 0.16, size, size);
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `800 ${Math.max(42, Math.min(84, width * 0.07))}px Impact, "Arial Black", sans-serif`;
  ctx.fillText("FLIPPER FRENZY", width / 2, height * 0.4);
  const fourSize = Math.max(28, Math.min(48, width * 0.04));
  ctx.font = `800 ${fourSize}px Impact, "Arial Black", sans-serif`;
  const letters = ["F", "O", "U", "R"];
  const gap = fourSize * 1.15;
  const start = width / 2 - (gap * 1.5);
  letters.forEach((letter, index) => {
    ctx.fillStyle = COLORS[index];
    ctx.fillText(letter, start + index * gap, height * 0.4 + fourSize + 8);
  });

  ctx.fillStyle = MUTED;
  ctx.font = `16px Verdana, sans-serif`;
  ctx.fillText("Four drains. One vortex. Last flipper standing.", width / 2, height * 0.62);

  const blink = 0.45 + Math.sin(game.animTime * 4) * 0.55;
  ctx.globalAlpha = Math.max(0.35, blink);
  ctx.fillStyle = INK;
  ctx.font = `700 22px Verdana, sans-serif`;
  ctx.fillText("PRESS ENTER  ·  START", width / 2, height * 0.74);
  ctx.globalAlpha = 1;
  ctx.font = `14px Verdana, sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.fillText("Empty seats start as bots  ·  M mutes", width / 2, height * 0.81);

  const ballX = width / 2 + Math.cos(game.animTime * 1.3) * Math.min(180, width * 0.16);
  const ballY = height * 0.9 + Math.sin(game.animTime * 2.1) * 10;
  ctx.fillStyle = "#fff8ea";
  ctx.beginPath();
  ctx.arc(ballX, ballY, 10, 0, Math.PI * 2);
  ctx.fill();

  addHot(hotspots, 0, 0, width, height, "title-start");
}

function drawJoin(ctx, width, height, game, hotspots) {
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `800 ${Math.min(48, width * 0.05)}px Impact, "Arial Black", sans-serif`;
  ctx.fillText("CHOOSE YOUR SIDES", width / 2, 64);
  ctx.font = "15px Verdana, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText("Action joins or steps out  ·  Secondary toggles bot / off  ·  Enter starts", width / 2, 92);

  const margin = 28;
  const gap = 16;
  const top = 118;
  const cardW = (width - margin * 2 - gap) / 2;
  const cardH = Math.min(210, (height - top - 90 - gap) / 2);
  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + col * (cardW + gap);
    const y = top + row * (cardH + gap);
    const player = game.players[i];
    roundRect(ctx, x, y, cardW, cardH, 16);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS[i];
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS[i];
    ctx.font = "700 22px Verdana, sans-serif";
    ctx.fillText(`${player.name}  ${player.label}`, x + 18, y + 36);
    ctx.fillStyle = INK;
    ctx.font = "700 28px Verdana, sans-serif";
    const role = player.role === "human" ? "HUMAN" : player.role === "bot" ? "BOT" : "OFF";
    ctx.fillText(role, x + 18, y + 78);
    const binds = game.bindings.players[i];
    ctx.fillStyle = MUTED;
    ctx.font = "14px Verdana, sans-serif";
    const moveKeys = [binds.up, binds.left, binds.down, binds.right].map(bindingLabel).join(" ");
    ctx.fillText(`Move ${moveKeys}`, x + 18, y + 112);
    ctx.fillText(`Left flipper ${bindingLabel(binds.action)}    Right flipper ${bindingLabel(binds.secondary)}`, x + 18, y + 136);
    if (game.padsConnected[i]) {
      ctx.fillStyle = COLORS[i];
      ctx.fillText("Gamepad connected", x + 18, y + 164);
      drawPadIcon(ctx, x + cardW - 46, y + 22, true, COLORS[i]);
    } else {
      drawPadIcon(ctx, x + cardW - 46, y + 22, false, "#5c5670");
    }
    addHot(hotspots, x, y, cardW, cardH, `join-${i}`);
  }

  button(ctx, hotspots, width / 2 - 210, height - 64, 180, 42, "START MATCH", "join-start", true);
  button(ctx, hotspots, width / 2 + 30, height - 64, 180, 42, "SETTINGS", "join-settings", false);
}

function drawTable(ctx, game, view) {
  ctx.save();
  roundRect(ctx, view.x - 16, view.y - 16, view.size + 32, view.size + 32, 28);
  ctx.fillStyle = "#1a1730";
  ctx.fill();
  ctx.strokeStyle = "#3a3458";
  ctx.lineWidth = 8;
  ctx.stroke();

  const felt = ctx.createRadialGradient(
    view.x + view.size / 2,
    view.y + view.size / 2,
    view.size * 0.1,
    view.x + view.size / 2,
    view.y + view.size / 2,
    view.size * 0.62,
  );
  felt.addColorStop(0, "#2a2148");
  felt.addColorStop(1, "#100e1c");
  roundRect(ctx, view.x, view.y, view.size, view.size, 18);
  ctx.fillStyle = felt;
  ctx.fill();
  ctx.restore();

  drawVortex(ctx, game, view);
  for (const player of game.players) drawMouth(ctx, game, view, player);
  for (const bumper of game.solids.bumpers) drawBumper(ctx, view, bumper);
  for (const target of game.solids.targets) drawTarget(ctx, game, view, target);
  drawSpinner(ctx, game, view);
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x - 14, view.y - 14, view.size + 28, view.size + 28);
  ctx.clip();
  for (const player of game.players) drawFlipperPair(ctx, game, view, player);
  ctx.restore();
  for (const ball of game.balls) drawBall(ctx, view, ball);
}

function drawVortex(ctx, game, view) {
  const c = project(view, CENTER, CENTER);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(game.animTime * 0.8);
  ctx.strokeStyle = "rgba(180, 150, 255, 0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, 18 + i * 16, i, i + 3.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMouth(ctx, game, view, player) {
  const closed = player.role === "off" || player.eliminated || game.time < player.shieldUntil;
  const span = (DRAIN_HALF * 2 * view.size) / TABLE;
  const depth = Math.max(14, view.scale * 22);
  let x = 0;
  let y = 0;
  let w = 0;
  let h = 0;
  if (player.side === "south") {
    w = span;
    h = depth;
    x = view.x + view.size / 2 - span / 2;
    y = view.y + view.size - 4;
  } else if (player.side === "north") {
    w = span;
    h = depth;
    x = view.x + view.size / 2 - span / 2;
    y = view.y - depth + 4;
  } else if (player.side === "east") {
    w = depth;
    h = span;
    x = view.x + view.size - 4;
    y = view.y + view.size / 2 - span / 2;
  } else {
    w = depth;
    h = span;
    x = view.x - depth + 4;
    y = view.y + view.size / 2 - span / 2;
  }
  ctx.fillStyle = closed ? "#241c33" : "#07060c";
  ctx.fillRect(x, y, w, h);
  if (player.eliminated || player.role === "off") {
    ctx.strokeStyle = player.role === "off" ? "#4a4560" : COLORS[player.index];
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5;
      ctx.beginPath();
      if (player.side === "north" || player.side === "south") {
        ctx.moveTo(x + 4, y + h * t);
        ctx.lineTo(x + w - 4, y + h * t);
      } else {
        ctx.moveTo(x + w * t, y + 4);
        ctx.lineTo(x + w * t, y + h - 4);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (game.time < player.shieldUntil) {
    ctx.fillStyle = "rgba(90, 230, 255, 0.35)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#9af6ff";
    ctx.strokeRect(x, y, w, h);
  } else {
    ctx.fillStyle = COLORS[player.index];
    ctx.globalAlpha = 0.8;
    ctx.fillRect(player.side === "east" || player.side === "west" ? x + w / 2 - 2 : x, player.side === "north" || player.side === "south" ? y + h / 2 - 2 : y, player.side === "east" || player.side === "west" ? 4 : w, player.side === "north" || player.side === "south" ? 4 : h);
    ctx.globalAlpha = 1;
  }
}

function drawBumper(ctx, view, bumper) {
  const p = project(view, bumper.x, bumper.y);
  const r = bumper.r * view.scale;
  const gradient = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.2, p.x, p.y, r);
  gradient.addColorStop(0, "#ffd0dc");
  gradient.addColorStop(0.45, "#ff4d6a");
  gradient.addColorStop(1, "#7a1430");
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "#ffd5df";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTarget(ctx, game, view, target) {
  const p = project(view, target.x, target.y);
  const r = target.r * view.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = target.cool > 0 ? "rgba(255, 220, 120, 0.25)" : "#ffe27a";
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.strokeStyle = "#fff6cc";
  ctx.strokeRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  void game;
}

function drawSpinner(ctx, game, view) {
  const spinner = game.solids.spinner;
  const c = project(view, spinner.x, spinner.y);
  const len = spinner.len * view.scale;
  const angle = spinner.angle;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(angle);
  ctx.strokeStyle = "#d7d2ff";
  ctx.lineWidth = Math.max(4, spinner.r * view.scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFlipperPair(ctx, game, view, player) {
  if (player.role === "off" || player.eliminated) return;
  ctx.lineCap = "round";
  ctx.strokeStyle = COLORS[player.index];
  ctx.lineWidth = Math.max(7, 15 * view.scale);
  for (const which of ["left", "right"]) {
    const pose = flipperEndpoints(player, which, game.time);
    const a = project(view, pose.pivot.x, pose.pivot.y);
    const b = project(view, pose.tip.x, pose.tip.y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(a.x, a.y, Math.max(3, 5 * view.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBall(ctx, view, ball) {
  const p = project(view, ball.x, ball.y);
  const r = Math.max(4, ball.r * view.scale);
  const tint = ball.lastTouch == null ? "#fff8ea" : COLORS[ball.lastTouch];
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = tint;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x - r * 0.3, p.y - r * 0.35, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
}

function drawSparks(ctx, game, view) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const spark = sparks[i];
    const age = game.animTime - spark.born;
    if (age > spark.life) {
      sparks.splice(i, 1);
      continue;
    }
    const dist = spark.speed * age;
    const p = project(view, spark.x + Math.cos(spark.angle) * dist, spark.y + Math.sin(spark.angle) * dist);
    ctx.globalAlpha = 1 - age / spark.life;
    ctx.fillStyle = spark.color;
    ctx.fillRect(p.x, p.y, 3, 3);
    ctx.globalAlpha = 1;
  }
}

function drawHud(ctx, width, height, game, view) {
  const panels = hudPanels(width, height, view);
  ctx.textAlign = "left";
  game.players.forEach((player, index) => {
    const panel = panels[index];
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 12);
    ctx.fillStyle = "rgba(8, 7, 16, 0.78)";
    ctx.fill();
    ctx.strokeStyle = COLORS[index];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLORS[index];
    ctx.font = "700 16px Verdana, sans-serif";
    const role = player.role === "human" ? "" : player.role === "bot" ? " BOT" : " OFF";
    ctx.fillText(`${player.name}${role}`, panel.x + 10, panel.y + 22);
    drawPadIcon(ctx, panel.x + panel.w - 28, panel.y + 8, !!game.padsConnected[index], game.padsConnected[index] ? COLORS[index] : "#5a546c");
    ctx.fillStyle = INK;
    ctx.font = "14px Verdana, sans-serif";
    if (player.role === "off") {
      ctx.fillStyle = MUTED;
      ctx.fillText("Side closed", panel.x + 10, panel.y + 46);
      return;
    }
    const hearts = player.eliminated ? "WALL" : `♥ ${player.lives}`;
    ctx.fillText(`${hearts}   ${player.score} pts   ★ ${player.roundWins}`, panel.x + 10, panel.y + 46);
    const tags = [];
    if (game.time < player.wideUntil) tags.push(`WIDE ${(player.wideUntil - game.time).toFixed(1)}s`);
    if (game.time < player.shieldUntil) tags.push(`SHIELD ${(player.shieldUntil - game.time).toFixed(1)}s`);
    if (player.tiltLock > 0) tags.push("TILT");
    ctx.fillStyle = tags.length ? "#ffe27a" : MUTED;
    ctx.font = "12px Verdana, sans-serif";
    ctx.fillText(tags.join("  ") || player.label, panel.x + 10, panel.y + 66);
    const tiltW = panel.w - 20;
    ctx.fillStyle = "#2a2638";
    ctx.fillRect(panel.x + 10, panel.y + panel.h - 12, tiltW, 4);
    ctx.fillStyle = player.tiltLock > 0 ? "#ff5a6a" : COLORS[index];
    ctx.fillRect(panel.x + 10, panel.y + panel.h - 12, tiltW * Math.max(0, Math.min(1, player.tilt)), 4);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "700 15px Verdana, sans-serif";
  const label = game.roundNumber ? `ROUND ${game.roundNumber}` : "GET READY";
  const balls = `${game.balls.length} ball${game.balls.length === 1 ? "" : "s"}`;
  ctx.fillText(`${label}   ·   FIRST TO ${game.winsNeeded}   ·   ${balls}`, width / 2, 22);
  void START_LIVES;
}

function drawCountdown(ctx, width, height, game) {
  let text = "GO";
  if (game.phase === "countdown") text = String(Math.max(1, Math.ceil(game.countdown - 1e-8)));
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "800 92px Impact, Arial Black, sans-serif";
  ctx.fillText(text, width / 2, height / 2 + 20);
}

function drawRoundBanner(ctx, width, height, game) {
  ctx.fillStyle = "rgba(5, 4, 12, 0.45)";
  ctx.fillRect(0, 0, width, height);
  const boxW = Math.min(560, width - 40);
  const boxH = 180;
  const x = (width - boxW) / 2;
  const y = (height - boxH) / 2;
  roundRect(ctx, x, y, boxW, boxH, 18);
  ctx.fillStyle = "rgba(16, 12, 28, 0.94)";
  ctx.fill();
  ctx.strokeStyle = game.roundWinner == null ? MUTED : COLORS[game.roundWinner];
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "800 36px Impact, Arial Black, sans-serif";
  const who = game.roundWinner == null ? "NOBODY" : game.players[game.roundWinner].name;
  ctx.fillText(`${who} TAKES THE ROUND`, width / 2, y + 78);
  ctx.font = "16px Verdana, sans-serif";
  ctx.fillStyle = MUTED;
  const wins = game.players.map((player) => player.roundWins).join("  ·  ");
  ctx.fillText(`Round wins  ${wins}`, width / 2, y + 118);
  if (game.matchPending) ctx.fillText("Match point decided", width / 2, y + 146);
}

function drawPause(ctx, width, height, game, hotspots, pointer) {
  ctx.fillStyle = "rgba(5, 4, 12, 0.55)";
  ctx.fillRect(0, 0, width, height);
  const items = [
    ["Resume", "pause-item-0"],
    ["Settings", "pause-item-1"],
    ["Controls", "pause-item-2"],
    ["Quit to title", "pause-item-3"],
  ];
  drawMenuCard(ctx, width, height, "PAUSED", items, game.menuIndex, hotspots, pointer);
}

function drawSettings(ctx, width, height, game, hotspots, pointer) {
  ctx.fillStyle = "rgba(5, 4, 12, 0.72)";
  ctx.fillRect(0, 0, width, height);
  const items = [
    [`Volume  ${Math.round(game.volume * 100)}%`, "settings-item-0"],
    [`First to  ${game.winsNeeded}  round wins`, "settings-item-1"],
    ["Controls", "settings-item-2"],
    ["Back", "settings-item-3"],
  ];
  drawMenuCard(ctx, width, height, "SETTINGS", items, game.menuIndex, hotspots, pointer, "Left / right adjusts volume and round wins");
}

function drawControls(ctx, width, height, game, hotspots) {
  ctx.fillStyle = "rgba(5, 4, 12, 0.78)";
  ctx.fillRect(0, 0, width, height);
  const boxW = Math.min(860, width - 24);
  const boxH = Math.min(height - 24, 620);
  const x = (width - boxW) / 2;
  const y = (height - boxH) / 2;
  roundRect(ctx, x, y, boxW, boxH, 16);
  ctx.fillStyle = "#120f1e";
  ctx.fill();
  ctx.strokeStyle = "#3d3658";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "800 28px Impact, Arial Black, sans-serif";
  ctx.fillText("CONTROLS", width / 2, y + 34);
  ctx.font = "13px Verdana, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText("Enter a row, then press a key. Pads: stick / D-pad, A, B, Start.", width / 2, y + 56);

  const labels = ["Up", "Down", "Left", "Right", "Left flipper", "Right flipper"];
  const colW = (boxW - 36) / 2;
  const rowH = 24;
  for (let index = 0; index < 24; index++) {
    const player = Math.floor(index / labels.length);
    const field = index % labels.length;
    const col = player < 2 ? 0 : 1;
    const row = (player % 2) * (labels.length + 1) + field;
    const left = x + 16 + col * colW;
    const top = y + 78 + row * rowH;
    if (field === 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = COLORS[player];
      ctx.font = "700 13px Verdana, sans-serif";
      ctx.fillText(game.players[player].name, left + 8, top - 4);
    }
    const selected = game.menuIndex === index;
    if (selected) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(left, top, colW - 12, rowH - 2);
    }
    ctx.font = "13px Verdana, sans-serif";
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(labels[field], left + 8, top + 15);
    const code = game.bindings.players[player][BIND_FIELDS[field]];
    const listening = game.rebind && game.rebind.player === player && game.rebind.field === BIND_FIELDS[field];
    ctx.textAlign = "right";
    ctx.fillStyle = listening ? "#ffe27a" : COLORS[player];
    ctx.fillText(listening ? "Press a key…" : bindingLabel(code), left + colW - 20, top + 15);
    addHot(hotspots, left, top, colW - 12, rowH - 2, `bind-${index}`);
  }
  const resetY = y + boxH - 86;
  const backY = y + boxH - 44;
  drawChoice(ctx, x + 24, resetY, boxW - 48, 34, "Reset defaults", game.menuIndex === 24);
  drawChoice(ctx, x + 24, backY, boxW - 48, 34, "Back", game.menuIndex === 25);
  addHot(hotspots, x + 24, resetY, boxW - 48, 34, "controls-reset");
  addHot(hotspots, x + 24, backY, boxW - 48, 34, "controls-back");
}

function drawMatch(ctx, width, height, game, hotspots) {
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `800 ${Math.min(64, width * 0.06)}px Impact, Arial Black, sans-serif`;
  const winner = game.winner == null ? null : game.players[game.winner];
  ctx.fillStyle = winner ? COLORS[winner.index] : INK;
  ctx.fillText(winner ? `${winner.name} WINS THE MATCH` : "MATCH OVER", width / 2, 110);
  ctx.font = "16px Verdana, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText("Standings", width / 2, 150);

  const rows = standings(game);
  rows.forEach((row, index) => {
    const y = 200 + index * 48;
    ctx.fillStyle = COLORS[row.index];
    ctx.font = "700 22px Verdana, sans-serif";
    ctx.fillText(`${index + 1}.  ${row.name}    ${row.roundWins} rounds    ${row.score} pts`, width / 2, y);
  });

  const selected = game.menuIndex === 0;
  button(ctx, hotspots, width / 2 - 200, height - 90, 170, 44, "REMATCH", "match-rematch", selected || game.menuIndex === 0);
  button(ctx, hotspots, width / 2 + 20, height - 90, 170, 44, "TITLE", "match-title", game.menuIndex === 1);
}

function drawMenuCard(ctx, width, height, title, items, selected, hotspots, pointer, hint) {
  const boxW = Math.min(460, width - 40);
  const boxH = 120 + items.length * 52;
  const x = (width - boxW) / 2;
  const y = (height - boxH) / 2;
  roundRect(ctx, x, y, boxW, boxH, 16);
  ctx.fillStyle = "rgba(14, 11, 24, 0.96)";
  ctx.fill();
  ctx.strokeStyle = "#4a4368";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "800 32px Impact, Arial Black, sans-serif";
  ctx.fillText(title, width / 2, y + 46);
  items.forEach((item, index) => {
    const iy = y + 70 + index * 52;
    const on = index === selected;
    drawChoice(ctx, x + 28, iy, boxW - 56, 42, item[0], on || (pointer && inside(pointer, x + 28, iy, boxW - 56, 42)));
    addHot(hotspots, x + 28, iy, boxW - 56, 42, item[1]);
  });
  if (hint) {
    ctx.font = "12px Verdana, sans-serif";
    ctx.fillStyle = MUTED;
    ctx.fillText(hint, width / 2, y + boxH - 16);
  }
}

function drawChoice(ctx, x, y, w, h, label, on) {
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = on ? "#2a2344" : "rgba(255,255,255,0.03)";
  ctx.fill();
  ctx.strokeStyle = on ? "#ffe27a" : "#3a3454";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "16px Verdana, sans-serif";
  ctx.fillText(label, x + w / 2, y + h / 2 + 6);
}

function button(ctx, hotspots, x, y, w, h, label, id, on) {
  drawChoice(ctx, x, y, w, h, label, on);
  addHot(hotspots, x, y, w, h, id);
}

function drawToast(ctx, width, height, message) {
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffb4c0";
  ctx.font = "700 16px Verdana, sans-serif";
  ctx.fillText(message, width / 2, height - 84);
}

function drawMute(ctx, width, game) {
  if (!game.muted && game.volume > 0) return;
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffb4c0";
  ctx.font = "700 13px Verdana, sans-serif";
  ctx.fillText(game.muted ? "MUTED" : "VOLUME 0", width - 16, 22);
}

function drawPadIcon(ctx, x, y, connected, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = connected ? color : "transparent";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, 18, 12, 4);
  ctx.stroke();
  if (connected) {
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 6, y + 7, 1.4, 0, Math.PI * 2);
  ctx.arc(x + 12, y + 7, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function hudPanels(width, height, view) {
  const w = Math.min(220, Math.max(148, view.x - 20));
  const h = 84;
  return [
    { x: (width - w) / 2, y: height - h - 12, w, h },
    { x: Math.min(width - w - 10, view.x + view.size + 12), y: view.y + (view.size - h) / 2, w, h },
    { x: (width - w) / 2, y: 32, w, h },
    { x: Math.max(10, view.x - w - 12), y: view.y + (view.size - h) / 2, w, h },
  ];
}

function tableView(width, height) {
  const side = Math.min(250, Math.max(160, width * 0.17));
  const top = 124;
  const bottom = 108;
  let size = Math.min(width - side * 2, height - top - bottom);
  if (size > width - 24) size = width - 24;
  if (size < 180) size = Math.max(140, Math.min(width - 24, height - 80));
  return {
    x: (width - size) / 2,
    y: top,
    size,
    scale: size / TABLE,
  };
}

function project(view, x, y) {
  return {
    x: view.x + (x / TABLE) * view.size,
    y: view.y + (y / TABLE) * view.size,
  };
}

function addHot(list, x, y, w, h, id) {
  list.push({ x, y, w, h, id });
}

function inside(pointer, x, y, w, h) {
  return pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
