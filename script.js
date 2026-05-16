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
  rNum: document.getElementById("redValue"),
  gNum: document.getElementById("greenValue"),
  bNum: document.getElementById("blueValue"),
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
  { time: 90, balls: 34, speed: 20, spawn: 0.42 },
  { time: 105, balls: 44, speed: 25, spawn: 0.52 },
  { time: 120, balls: 56, speed: 30, spawn: 0.62 },
];

const BALL_SPACING = 34;
const MATCH_GAP = 40;

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
    const p0 = pathPoints[Math.max(0, i - 1)];
    const p1 = pathPoints[i];
    const p2 = pathPoints[i + 1];
    const p3 = pathPoints[Math.min(pathPoints.length - 1, i + 2)];
    const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(10, Math.floor(chord / 4));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const point = catmullRom(p0, p1, p2, p3, t);
      addPathSample(point[0], point[1]);
    }
  }
  const last = pathPoints[pathPoints.length - 1];
  addPathSample(last[0], last[1]);
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function addPathSample(x, y) {
  const previous = pathSamples[pathSamples.length - 1];
  if (previous) {
    const segment = Math.hypot(x - previous.x, y - previous.y);
    if (segment < 0.5) return;
    pathLength += segment;
  }
  pathSamples.push({ x, y, d: pathLength });
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
    floaters: [],
    explosions: [],
    shooter: { x: 640, y: 392 },
    currentColor: randomColorInBalls(balls),
    nextColor: randomColorInBalls(balls),
    chainBonus: 0,
    maxCombo: 0,
    paused: false,
    timerFrozen: 0,
    rewindActive: 0,
    skills: { pause: 3, rewind: 3, blast: 3 },
    won: false,
    lost: false,
  };
}

function randomColorInBalls(balls = state?.balls || []) {
  const colors = [...new Set(balls.map((ball) => ball.colorIndex))];
  if (!colors.length) return Math.floor(Math.random() * basePalette.length);
  return colors[Math.floor(Math.random() * colors.length)];
}

function keepShooterColorsInChain() {
  const colors = new Set(state.balls.map((ball) => ball.colorIndex));
  if (!colors.size) return;
  if (!colors.has(state.currentColor)) state.currentColor = randomColorInBalls();
  if (!colors.has(state.nextColor)) state.nextColor = randomColorInBalls();
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

function findPathHitCandidates(x, y, maxGap = 18) {
  const candidates = [];
  for (const sample of pathSamples) {
    const gap = Math.hypot(sample.x - x, sample.y - y);
    if (gap <= maxGap) candidates.push({ ...sample, gap });
  }
  candidates.sort((a, b) => a.gap - b.gap);
  return candidates.filter((candidate, index, list) => {
    const duplicate = list.findIndex((item) => Math.abs(item.d - candidate.d) < 70) !== index;
    return !duplicate;
  });
}

function hasBallNearPathDistance(distance, range = 58) {
  if (state.balls.length === 0) return true;
  return state.balls.some((ball) => Math.abs(ball.distance - distance) <= range);
}

function findNearestBallIndexByPathDistance(distance, range = 58) {
  let bestIndex = -1;
  let bestGap = Infinity;
  state.balls.forEach((ball, index) => {
    const gap = Math.abs(ball.distance - distance);
    if (gap <= range && gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function hasSkippedTrack(shot, distance) {
  return shot.skippedTracks.some((skippedDistance) => Math.abs(skippedDistance - distance) < 80);
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
  beginSmoothTrackPath();
  ctx.strokeStyle = "#263f37";
  ctx.lineWidth = 70;
  ctx.stroke();
  beginSmoothTrackPath();
  ctx.strokeStyle = "#716a4d";
  ctx.lineWidth = 54;
  ctx.stroke();
  beginSmoothTrackPath();
  ctx.strokeStyle = "#342f25";
  ctx.lineWidth = 42;
  ctx.stroke();
  beginSmoothTrackPath();
  ctx.strokeStyle = "#5c654f";
  ctx.lineWidth = 34;
  ctx.stroke();

  ctx.setLineDash([18, 20]);
  beginSmoothTrackPath();
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

function beginSmoothTrackPath() {
  ctx.beginPath();
  if (!pathSamples.length) return;
  ctx.moveTo(pathSamples[0].x, pathSamples[0].y);
  const stride = 6;
  for (let i = stride; i < pathSamples.length - stride; i += stride) {
    const current = pathSamples[i];
    const next = pathSamples[Math.min(pathSamples.length - 1, i + stride)];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    ctx.quadraticCurveTo(current.x, current.y, midX, midY);
  }
  const last = pathSamples[pathSamples.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawBall(x, y, radius, color, skill = null, patternIndex = 0) {
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
  drawBallPattern(x, y, radius, patternIndex);

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

function drawBallPattern(x, y, radius, patternIndex) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 2;
  const type = patternIndex % 6;
  if (type === 0) {
    for (let i = -radius; i <= radius; i += 8) {
      ctx.beginPath();
      ctx.arc(x + i, y, radius * 0.55, -0.9, 0.9);
      ctx.stroke();
    }
  } else if (type === 1) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === 2) {
    for (let i = -radius; i <= radius; i += 9) {
      ctx.beginPath();
      ctx.moveTo(x - radius, y + i);
      ctx.lineTo(x + radius, y + i + radius * 0.7);
      ctx.stroke();
    }
  } else if (type === 3) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * radius * 0.28, y + Math.sin(a) * radius * 0.28, radius * 0.2, radius * 0.38, a, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (type === 4) {
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.arc(x, y + i * radius * 0.32, radius * 0.55, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 6; i += 1) {
      const a = i * Math.PI / 3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * radius * 0.46, y + Math.sin(a) * radius * 0.46, radius * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawShooter() {
  const { x, y } = state.shooter;
  const pointer = state.pointer || { x: 640, y: 160 };
  const angle = Math.atan2(pointer.y - y, pointer.x - x);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const barrel = ctx.createLinearGradient(8, 0, 72, 0);
  barrel.addColorStop(0, "#5d3f19");
  barrel.addColorStop(0.42, "#f4c667");
  barrel.addColorStop(1, "#7adfe3");
  ctx.fillStyle = barrel;
  ctx.strokeStyle = "#ffdd7a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(14, -13);
  ctx.lineTo(68, -8);
  ctx.quadraticCurveTo(82, 0, 68, 8);
  ctx.lineTo(14, 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.fillRect(22, -5, 40, 3);
  ctx.restore();

  const baseGrad = ctx.createRadialGradient(x - 18, y - 24, 10, x, y, 58);
  baseGrad.addColorStop(0, "#ffe29a");
  baseGrad.addColorStop(0.38, "#9d6e2c");
  baseGrad.addColorStop(1, "#2d1f13");
  ctx.fillStyle = baseGrad;
  ctx.beginPath();
  ctx.arc(x, y, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f3c35b";
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = "#d9a646";
  ctx.lineWidth = 3;
  for (let i = 0; i < 12; i += 1) {
    const a = i * Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 38, y + Math.sin(a) * 38);
    ctx.lineTo(x + Math.cos(a) * 53, y + Math.sin(a) * 53);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, 28, 0, Math.PI * 2);
  ctx.fillStyle = "#153b3c";
  ctx.fill();
  ctx.strokeStyle = "#58dcff";
  ctx.lineWidth = 3;
  ctx.stroke();
  drawBall(x, y, 24, basePalette[state.currentColor].color, null, state.currentColor);
  drawBall(x - Math.cos(angle) * 42, y - Math.sin(angle) * 42, 12, basePalette[state.nextColor].color, null, state.nextColor);
}

function drawShots() {
  state.shots.forEach((shot) => drawBall(shot.x, shot.y, 14, basePalette[shot.colorIndex].color, null, shot.colorIndex));
}

function drawFloaters() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "800 22px Microsoft YaHei, Segoe UI, Arial";
  state.floaters.forEach((floater) => {
    ctx.globalAlpha = clamp(floater.life / 1.2, 0, 1);
    ctx.fillStyle = "rgba(4, 18, 20, 0.75)";
    ctx.fillText(floater.text, floater.x + 2, floater.y + 2);
    ctx.fillStyle = rgbString(basePalette[floater.colorIndex]?.color || [255, 255, 255]);
    ctx.fillText(floater.text, floater.x, floater.y);
  });
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawExplosions() {
  state.explosions.forEach((explosion) => {
    const age = 1 - explosion.life / explosion.maxLife;
    const alpha = clamp(explosion.life / explosion.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * 0.42;
    ctx.strokeStyle = rgbString(explosion.color);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, 18 + age * 36, 0, Math.PI * 2);
    ctx.stroke();
    explosion.trails.forEach((trail) => {
      ctx.globalAlpha = alpha * trail.alpha;
      drawBall(trail.x, trail.y, trail.r, explosion.color, null, explosion.patternIndex);
    });
    explosion.particles.forEach((particle) => {
      ctx.globalAlpha = alpha * particle.alpha;
      ctx.fillStyle = rgbString(explosion.color.map((c) => clamp(c + 35, 0, 255)));
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  });
}

function drawChain() {
  const ordered = [...state.balls].sort((a, b) => b.distance - a.distance);
  ordered.forEach((ball) => {
    const point = samplePath(ball.distance);
    drawBall(point.x, point.y, ball.radius, basePalette[ball.colorIndex].color, ball.skill, ball.colorIndex);
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
  drawExplosions();
  drawShots();
  drawFloaters();
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
  state.explosions.forEach((explosion) => {
    explosion.life -= delta;
    explosion.particles.forEach((particle) => {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 70 * delta;
    });
    explosion.trails.forEach((trail) => {
      trail.r += 8 * delta;
      trail.alpha -= 0.8 * delta;
    });
  });
  state.explosions = state.explosions.filter((explosion) => explosion.life > 0);
  state.floaters.forEach((floater) => {
    floater.y -= 28 * delta;
    floater.life -= delta;
  });
  state.floaters = state.floaters.filter((floater) => floater.life > 0);

  state.shots.forEach((shot) => {
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    shot.travel += Math.hypot(shot.vx * delta, shot.vy * delta);
  });
  handleShotCollisions();
  state.shots = state.shots.filter((shot) => !shot.hit && shot.x > -40 && shot.x < 1320 && shot.y > -40 && shot.y < 760);

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
    if (hitIndex !== -1) {
      insertShotNearBall(shot, hitIndex);
      continue;
    }

    if (shot.travel < 90) continue;
    const candidates = findPathHitCandidates(shot.x, shot.y);
    for (const candidate of candidates) {
      if (hasSkippedTrack(shot, candidate.d)) continue;
      const nearBallIndex = findNearestBallIndexByPathDistance(candidate.d);
      if (nearBallIndex !== -1) {
        insertShotNearBall(shot, nearBallIndex);
        break;
      }
      if (state.balls.length === 0 || hasBallNearPathDistance(candidate.d)) {
        insertShotAtDistance(shot, candidate.d);
        break;
      }
      shot.skippedTracks.push(candidate.d);
    }
  }
}

function insertShotNearBall(shot, ballIndex) {
  const ball = state.balls[ballIndex];
  const insertDistance = chooseInsertDistance(shot, ball);
  insertShotAtDistance(shot, insertDistance);
}

function chooseInsertDistance(shot, ball) {
  const behind = samplePath(ball.distance - BALL_SPACING);
  const ahead = samplePath(ball.distance + BALL_SPACING);
  const behindGap = Math.hypot(behind.x - shot.x, behind.y - shot.y);
  const aheadGap = Math.hypot(ahead.x - shot.x, ahead.y - shot.y);
  return aheadGap < behindGap ? ball.distance + BALL_SPACING * 0.52 : ball.distance - BALL_SPACING * 0.52;
}

function insertShotAtDistance(shot, distance) {
  shot.hit = true;
  const insertDistance = clamp(distance, 0, pathLength - 18);
  const insertedBall = {
      colorIndex: shot.colorIndex,
      distance: insertDistance,
      radius: 15,
      skill: null,
  };
  state.balls.push(insertedBall);
  normalizeChain();
  const insertedIndex = state.balls.indexOf(insertedBall);
  resolveMatches(Math.max(0, insertedIndex));
  keepShooterColorsInChain();
}

function normalizeChain() {
  state.balls.sort((a, b) => a.distance - b.distance);
  for (let i = 1; i < state.balls.length; i += 1) {
    if (state.balls[i].distance - state.balls[i - 1].distance < BALL_SPACING - 2) {
      state.balls[i].distance = state.balls[i - 1].distance + BALL_SPACING - 2;
    }
  }
}

function resolveMatches(startIndex, combo = 0) {
  const target = state.balls[startIndex];
  if (!target) return;
  let left = startIndex;
  let right = startIndex;
  while (
    left > 0 &&
    state.balls[left - 1].colorIndex === target.colorIndex &&
    state.balls[left].distance - state.balls[left - 1].distance <= MATCH_GAP
  ) left -= 1;
  while (
    right < state.balls.length - 1 &&
    state.balls[right + 1].colorIndex === target.colorIndex &&
    state.balls[right + 1].distance - state.balls[right].distance <= MATCH_GAP
  ) right += 1;
  const count = right - left + 1;
  if (count < 3) {
    if (combo === 0) state.chainBonus = 0;
    return;
  }

  const center = state.balls[Math.floor((left + right) / 2)];
  const centerPoint = samplePath(center.distance);
  const removed = state.balls.splice(left, count);
  state.chainBonus = combo + 1;
  state.maxCombo = Math.max(state.maxCombo, state.chainBonus);
  const bonus = count * count * 10 + Math.max(0, count - 3) * 25 + combo * 120;
  state.score += bonus;
  removed.forEach((ball, offset) => {
    const point = samplePath(ball.distance);
    createExplosion(point.x, point.y, basePalette[ball.colorIndex].color, ball.colorIndex, offset);
  });
  addFloatingText(centerPoint.x, centerPoint.y, combo ? `+${bonus} 连击 x${combo + 1}` : `+${bonus}`, target.colorIndex);
  removed.forEach((ball) => {
    if (ball.skill) state.skills[ball.skill] = Math.min(9, state.skills[ball.skill] + 1);
  });
  pullGaps(left);
  const bridgeIndex = clamp(left, 0, state.balls.length - 1);
  if (state.balls[bridgeIndex]) resolveMatches(bridgeIndex, combo + 1);
  keepShooterColorsInChain();
}

function pullGaps(from) {
  for (let i = from; i < state.balls.length; i += 1) {
    const prev = state.balls[i - 1];
    if (prev && state.balls[i].distance - prev.distance > BALL_SPACING + 1) {
      state.balls[i].distance = prev.distance + BALL_SPACING + 1;
    }
  }
}

function addFloatingText(x, y, text, colorIndex) {
  state.floaters.push({ x, y, text, colorIndex, life: 1.2 });
}

function createExplosion(x, y, color, patternIndex, seed = 0) {
  const particles = [];
  const trails = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = i * Math.PI * 2 / 12 + seed * 0.18;
    const speed = 90 + (i % 4) * 22;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 2.2 + (i % 3),
      alpha: 0.85,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    trails.push({
      x: x - i * 4,
      y: y + i * 2,
      r: 15 - i * 2,
      alpha: 0.32 - i * 0.06,
    });
  }
  state.explosions.push({ x, y, color, patternIndex, particles, trails, life: 0.72, maxLife: 0.72 });
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
    travel: 0,
    skippedTracks: [],
  });
  state.currentColor = state.nextColor;
  state.nextColor = randomColorInBalls();
}

function swapShooterBalls() {
  if (state.paused || state.won || state.lost) return;
  const previous = state.currentColor;
  state.currentColor = state.nextColor;
  state.nextColor = previous;
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
  ranges.rNum.value = color[0];
  ranges.gNum.value = color[1];
  ranges.bNum.value = color[2];
  const [y, u, v] = rgbToYuv(color);
  ranges.y.value = y;
  ranges.u.value = clamp(u, -90, 90);
  ranges.v.value = clamp(v, -90, 90);
}

function applyColorFromRanges() {
  if (editMode === "RGB") {
    syncRgbPair(ranges.r, ranges.rNum);
    syncRgbPair(ranges.g, ranges.gNum);
    syncRgbPair(ranges.b, ranges.bNum);
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

function syncRgbPair(range, numberInput) {
  const active = document.activeElement === numberInput ? numberInput : range;
  const value = clamp(Number(active.value) || 0, 30, 255);
  range.value = value;
  numberInput.value = value;
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
canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  swapShooterBalls();
});
ui.nextPreview.addEventListener("click", swapShooterBalls);
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
