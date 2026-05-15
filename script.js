const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  levelText: document.getElementById("levelText"),
  scoreText: document.getElementById("scoreText"),
  timerText: document.getElementById("timerText"),
  timerBar: document.getElementById("timerBar"),
  nextPreview: document.getElementById("nextPreview"),
  pauseButton: document.getElementById("pauseButton"),
  restartButton: document.getElementById("restartButton"),
  message: document.getElementById("message"),
  modeToggle: document.getElementById("modeToggle"),
  rgbControls: document.getElementById("rgbControls"),
  yuvControls: document.getElementById("yuvControls"),
  swatches: document.getElementById("swatches"),
  pauseCount: document.getElementById("pauseCount"),
  rewindCount: document.getElementById("rewindCount"),
  blastCount: document.getElementById("blastCount"),
};

const ranges = {
  r: document.getElementById("redRange"),
  g: document.getElementById("greenRange"),
  b: document.getElementById("blueRange"),
  y: document.getElementById("yRange"),
  u: document.getElementById("uRange"),
  v: document.getElementById("vRange"),
};

const basePalette = [
  { name: "red", color: [230, 62, 58] },
  { name: "yellow", color: [244, 194, 52] },
  { name: "blue", color: [38, 112, 235] },
  { name: "green", color: [87, 204, 56] },
  { name: "cyan", color: [52, 201, 218] },
  { name: "violet", color: [158, 72, 224] },
];

const levels = [
  { time: 90, balls: 34, speed: 35, spawn: 0.42 },
  { time: 105, balls: 44, speed: 42, spawn: 0.52 },
  { time: 120, balls: 56, speed: 50, spawn: 0.62 },
];

const pathPoints = [
  [112, 500],
  [250, 610],
  [550, 615],
  [900, 560],
  [1055, 410],
  [965, 245],
  [680, 215],
  [365, 238],
  [175, 330],
  [240, 455],
  [445, 495],
  [720, 480],
  [858, 382],
  [760, 310],
  [525, 326],
  [360, 390],
];

let pathSamples = [];
let pathLength = 0;
let state;
let lastTime = performance.now();
let selectedColor = 0;
let editMode = "RGB";

function buildPath() {
  pathSamples = [];
  pathLength = 0;
  for (let i = 0; i < pathPoints.length - 1; i += 1) {
    const [x1, y1] = pathPoints[i];
    const [x2, y2] = pathPoints[i + 1];
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(4, Math.floor(dist / 5));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      pathSamples.push({
        x: x1 + (x2 - x1) * t,
        y: y1 + (y2 - y1) * t,
        d: pathLength + dist * t,
      });
    }
    pathLength += dist;
  }
  const last = pathPoints[pathPoints.length - 1];
  pathSamples.push({ x: last[0], y: last[1], d: pathLength });
}

function createState(levelIndex = 0) {
  const level = levels[levelIndex];
  const balls = [];
  for (let i = 0; i < level.balls; i += 1) {
    balls.push({
      colorIndex: Math.floor(Math.random() * basePalette.length),
      distance: i * 34,
      radius: 15,
      skill: randomSkill(level.spawn),
    });
  }
  return {
    levelIndex,
    score: levelIndex === 0 ? 0 : state.score,
    timeLeft: level.time,
    totalTime: level.time,
    balls,
    shots: [],
    shooter: { x: 640, y: 392 },
    currentColor: Math.floor(Math.random() * basePalette.length),
    nextColor: Math.floor(Math.random() * basePalette.length),
    paused: false,
    timerFrozen: 0,
    rewindActive: 0,
    skills: { pause: 3, rewind: 3, blast: 3 },
    won: false,
    lost: false,
  };
}

function randomSkill(chance) {
  if (Math.random() > chance * 0.13) return null;
  return ["pause", "rewind", "blast"][Math.floor(Math.random() * 3)];
}

function samplePath(distance) {
  const d = Math.max(0, Math.min(pathLength, distance));
  let low = 0;
  let high = pathSamples.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (pathSamples[mid].d < d) low = mid + 1;
    else high = mid;
  }
  return pathSamples[low];
}

function rgbString(color) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function yuvToRgb(y, u, v) {
  return [
    clamp(y + 1.14 * v, 0, 255),
    clamp(y - 0.395 * u - 0.581 * v, 0, 255),
    clamp(y + 2.032 * u, 0, 255),
  ].map(Math.round);
}

function rgbToYuv([r, g, b]) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const u = 0.492 * (b - y);
  const v = 0.877 * (r - y);
  return [Math.round(y), Math.round(u), Math.round(v)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.setTransform(scale * rect.width / 1280, 0, 0, scale * rect.height / 720, 0, 0);
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 1280, 720);
  grad.addColorStop(0, "#0b4b4a");
  grad.addColorStop(0.55, "#0d3937");
  grad.addColorStop(1, "#09262d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1280, 720);

  ctx.fillStyle = "rgba(17, 90, 72, 0.55)";
  for (let i = 0; i < 70; i += 1) {
    const x = (i * 197) % 1320 - 20;
    const y = (i * 83) % 760 - 20;
    ctx.beginPath();
    ctx.ellipse(x, y, 18 + (i % 5) * 6, 8 + (i % 3) * 5, i, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(10, 30, 26, 0.42)";
  for (let y = 110; y < 680; y += 55) {
    for (let x = 90; x < 1160; x += 68) {
      ctx.fillRect(x, y, 48, 35);
    }
  }
}

function drawTrack() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  pathPoints.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = "#263f37";
  ctx.lineWidth = 70;
  ctx.stroke();
  ctx.strokeStyle = "#716a4d";
  ctx.lineWidth = 54;
  ctx.stroke();
  ctx.strokeStyle = "#342f25";
  ctx.lineWidth = 42;
  ctx.stroke();
  ctx.strokeStyle = "#5c654f";
  ctx.lineWidth = 34;
  ctx.stroke();

  ctx.setLineDash([18, 20]);
  ctx.strokeStyle = "rgba(26, 34, 29, 0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);

  const entrance = samplePath(0);
  const end = samplePath(pathLength);
  ctx.fillStyle = "#20160e";
  ctx.beginPath();
  ctx.arc(entrance.x, entrance.y, 39, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(end.x, end.y, 42, 0, Math.PI * 2);
  ctx.fill();
}

function drawBall(x, y, radius, color, skill = null) {
  const grad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.45, 2, x, y, radius);
  grad.addColorStop(0, "#fff6d4");
  grad.addColorStop(0.18, rgbString(color.map((c) => clamp(c + 45, 0, 255))));
  grad.addColorStop(0.58, rgbString(color));
  grad.addColorStop(1, rgbString(color.map((c) => clamp(c * 0.55, 0, 255))));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (skill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = 2;
    if (skill === "pause") {
      ctx.fillRect(-5, -9, 4, 18);
      ctx.fillRect(3, -9, 4, 18);
    } else if (skill === "rewind") {
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(2, -9);
      ctx.lineTo(2, -3);
      ctx.lineTo(11, -3);
      ctx.lineTo(11, 3);
      ctx.lineTo(2, 3);
      ctx.lineTo(2, 9);
      ctx.closePath();
      ctx.fill();
    } else {
      for (let i = 0; i < 8; i += 1) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-2, -13, 4, 10);
      }
    }
    ctx.restore();
  }
}

function drawShooter() {
  const { x, y } = state.shooter;
  const pointer = state.pointer || { x: 640, y: 160 };
  const angle = Math.atan2(pointer.y - y, pointer.x - x);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "#ba8d34";
  ctx.strokeStyle = "#f0c45b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(58, -11);
  ctx.lineTo(58, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#4d351b";
  ctx.beginPath();
  ctx.arc(x, y, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d9a646";
  ctx.lineWidth = 6;
  ctx.stroke();
  drawBall(x, y, 24, basePalette[state.currentColor].color);
}

function drawShots() {
  state.shots.forEach((shot) => drawBall(shot.x, shot.y, 14, basePalette[shot.colorIndex].color));
}

function drawChain() {
  const ordered = [...state.balls].sort((a, b) => b.distance - a.distance);
  ordered.forEach((ball) => {
    const point = samplePath(ball.distance);
    drawBall(point.x, point.y, ball.radius, basePalette[ball.colorIndex].color, ball.skill);
  });
}

function drawAim() {
  const { x, y } = state.shooter;
  const pointer = state.pointer || { x: 640, y: 160 };
  const angle = Math.atan2(pointer.y - y, pointer.x - x);
  ctx.fillStyle = "#58dcff";
  for (let i = 1; i < 10; i += 1) {
    ctx.globalAlpha = 1 - i * 0.08;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * i * 34, y + Math.sin(angle) * i * 34, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  drawBackground();
  drawTrack();
  drawAim();
  drawChain();
  drawShots();
  drawShooter();
}

function update(delta) {
  if (state.paused || state.won || state.lost) return;
  const level = levels[state.levelIndex];
  const direction = state.rewindActive > 0 ? -1 : 1;
  const speed = level.speed * direction;

  state.balls.forEach((ball, index) => {
    const desired = index * 34;
    if (direction > 0) {
      ball.distance += speed * delta;
      if (index > 0 && ball.distance - state.balls[index - 1].distance < 32) {
        ball.distance = state.balls[index - 1].distance + 32;
      }
    } else {
      ball.distance = Math.max(desired, ball.distance + speed * delta * 2.2);
    }
  });

  if (state.timerFrozen > 0) state.timerFrozen -= delta;
  else state.timeLeft -= delta;
  if (state.rewindActive > 0) state.rewindActive -= delta;

  state.shots.forEach((shot) => {
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
  });
  handleShotCollisions();
  state.shots = state.shots.filter((shot) => shot.x > -40 && shot.x < 1320 && shot.y > -40 && shot.y < 760);

  if (state.balls.some((ball) => ball.distance >= pathLength - 8)) endGame(false);
  if (state.timeLeft <= 0) endGame(false);
  if (state.balls.length === 0) nextLevel();
}

function handleShotCollisions() {
  for (const shot of state.shots) {
    if (shot.hit) continue;
    const hitIndex = state.balls.findIndex((ball) => {
      const point = samplePath(ball.distance);
      return Math.hypot(point.x - shot.x, point.y - shot.y) < 28;
    });
    if (hitIndex === -1) continue;
    shot.hit = true;
    const hitBall = state.balls[hitIndex];
    const insertDistance = hitBall.distance + (shot.x > samplePath(hitBall.distance).x ? 17 : -17);
    state.balls.splice(hitIndex + 1, 0, {
      colorIndex: shot.colorIndex,
      distance: insertDistance,
      radius: 15,
      skill: null,
    });
    normalizeChain();
    resolveMatches(hitIndex + 1);
  }
}

function normalizeChain() {
  state.balls.sort((a, b) => a.distance - b.distance);
  for (let i = 1; i < state.balls.length; i += 1) {
    if (state.balls[i].distance - state.balls[i - 1].distance < 32) {
      state.balls[i].distance = state.balls[i - 1].distance + 32;
    }
  }
}

function resolveMatches(startIndex) {
  const target = state.balls[startIndex];
  if (!target) return;
  let left = startIndex;
  let right = startIndex;
  while (left > 0 && state.balls[left - 1].colorIndex === target.colorIndex) left -= 1;
  while (right < state.balls.length - 1 && state.balls[right + 1].colorIndex === target.colorIndex) right += 1;
  const count = right - left + 1;
  if (count < 3) return;

  const removed = state.balls.splice(left, count);
  const bonus = count * count * 10 + Math.max(0, count - 3) * 25;
  state.score += bonus;
  removed.forEach((ball) => {
    if (ball.skill) state.skills[ball.skill] = Math.min(9, state.skills[ball.skill] + 1);
  });
  pullGaps(left);
}

function pullGaps(from) {
  for (let i = from; i < state.balls.length; i += 1) {
    const prev = state.balls[i - 1];
    if (prev && state.balls[i].distance - prev.distance > 35) {
      state.balls[i].distance = prev.distance + 35;
    }
  }
}

function shoot(pointer) {
  if (state.paused || state.won || state.lost) return;
  const angle = Math.atan2(pointer.y - state.shooter.y, pointer.x - state.shooter.x);
  state.shots.push({
    x: state.shooter.x + Math.cos(angle) * 40,
    y: state.shooter.y + Math.sin(angle) * 40,
    vx: Math.cos(angle) * 650,
    vy: Math.sin(angle) * 650,
    colorIndex: state.currentColor,
  });
  state.currentColor = state.nextColor;
  state.nextColor = Math.floor(Math.random() * basePalette.length);
}

function useSkill(skill) {
  if (state.skills[skill] <= 0 || state.won || state.lost) return;
  state.skills[skill] -= 1;
  if (skill === "pause") state.timerFrozen = 8;
  if (skill === "rewind") state.rewindActive = 4;
  if (skill === "blast") {
    const pointer = state.pointer || state.shooter;
    let nearest = -1;
    let best = Infinity;
    state.balls.forEach((ball, index) => {
      const point = samplePath(ball.distance);
      const dist = Math.hypot(point.x - pointer.x, point.y - pointer.y);
      if (dist < best) {
        best = dist;
        nearest = index;
      }
    });
    if (nearest >= 0) {
      const start = Math.max(0, nearest - 1);
      const count = Math.min(3, state.balls.length - start);
      state.balls.splice(start, count);
      state.score += 120;
      pullGaps(start);
    }
  }
}

function nextLevel() {
  if (state.levelIndex >= levels.length - 1) {
    endGame(true);
    return;
  }
  const carryScore = state.score + Math.round(state.timeLeft) * 15;
  state = createState(state.levelIndex + 1);
  state.score = carryScore;
  showMessage(`进入第 ${state.levelIndex + 1} 关`, 1400);
}

function endGame(won) {
  state.won = won;
  state.lost = !won;
  ui.message.classList.remove("hidden");
  ui.message.innerHTML = won
    ? `<h2>通关成功</h2><p>最终分数：${state.score}</p><button type="button" onclick="restartGame()">再玩一次</button>`
    : `<h2>挑战失败</h2><p>分数：${state.score}</p><button type="button" onclick="restartGame()">重新开始</button>`;
}

function showMessage(text, ms) {
  ui.message.classList.remove("hidden");
  ui.message.textContent = text;
  window.setTimeout(() => ui.message.classList.add("hidden"), ms);
}

function restartGame() {
  state = createState(0);
  ui.message.classList.add("hidden");
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const min = String(Math.floor(safe / 60)).padStart(2, "0");
  const sec = String(safe % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function syncUi() {
  ui.levelText.textContent = `${state.levelIndex + 1}/3`;
  ui.scoreText.textContent = state.score.toLocaleString("zh-CN");
  ui.timerText.textContent = formatTime(state.timeLeft);
  ui.timerBar.style.width = `${clamp((state.timeLeft / state.totalTime) * 100, 0, 100)}%`;
  ui.pauseButton.textContent = state.paused ? "继续" : "暂停";
  ui.nextPreview.style.background = makeOrbCss(basePalette[state.nextColor].color);
  ui.pauseCount.textContent = state.skills.pause;
  ui.rewindCount.textContent = state.skills.rewind;
  ui.blastCount.textContent = state.skills.blast;
}

function makeOrbCss(color) {
  const hi = color.map((c) => clamp(c + 55, 0, 255));
  const lo = color.map((c) => clamp(c * 0.54, 0, 255));
  return `radial-gradient(circle at 32% 24%, #fff6cc 0 8%, rgb(${hi}) 18%, rgb(${color}) 60%, rgb(${lo}) 100%)`;
}

function updateSwatches() {
  ui.swatches.innerHTML = "";
  basePalette.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `swatch${index === selectedColor ? " selected" : ""}`;
    button.style.background = makeOrbCss(entry.color);
    button.title = entry.name;
    button.addEventListener("click", () => {
      selectedColor = index;
      syncRangesFromColor();
      updateSwatches();
    });
    ui.swatches.appendChild(button);
  });
}

function syncRangesFromColor() {
  const color = basePalette[selectedColor].color;
  ranges.r.value = color[0];
  ranges.g.value = color[1];
  ranges.b.value = color[2];
  const [y, u, v] = rgbToYuv(color);
  ranges.y.value = y;
  ranges.u.value = clamp(u, -90, 90);
  ranges.v.value = clamp(v, -90, 90);
}

function applyColorFromRanges() {
  if (editMode === "RGB") {
    basePalette[selectedColor].color = [
      Number(ranges.r.value),
      Number(ranges.g.value),
      Number(ranges.b.value),
    ];
  } else {
    basePalette[selectedColor].color = yuvToRgb(
      Number(ranges.y.value),
      Number(ranges.u.value),
      Number(ranges.v.value),
    );
  }
  updateSwatches();
}

function toGamePoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 1280,
    y: ((event.clientY - rect.top) / rect.height) * 720,
  };
}

function loop(now) {
  const delta = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(delta);
  draw();
  syncUi();
  requestAnimationFrame(loop);
}

buildPath();
state = createState(0);
resizeCanvas();
syncRangesFromColor();
updateSwatches();
syncUi();

window.addEventListener("resize", resizeCanvas);
canvas.addEventListener("pointermove", (event) => {
  state.pointer = toGamePoint(event);
});
canvas.addEventListener("pointerdown", (event) => {
  shoot(toGamePoint(event));
});
ui.pauseButton.addEventListener("click", () => {
  state.paused = !state.paused;
});
ui.restartButton.addEventListener("click", restartGame);
ui.modeToggle.addEventListener("click", () => {
  editMode = editMode === "RGB" ? "YUV" : "RGB";
  ui.modeToggle.textContent = editMode;
  ui.rgbControls.classList.toggle("hidden", editMode !== "RGB");
  ui.yuvControls.classList.toggle("hidden", editMode !== "YUV");
  syncRangesFromColor();
});
Object.values(ranges).forEach((range) => range.addEventListener("input", applyColorFromRanges));
document.querySelectorAll(".skill-dock button").forEach((button) => {
  button.addEventListener("click", () => useSkill(button.dataset.skill));
});
window.restartGame = restartGame;
requestAnimationFrame(loop);
