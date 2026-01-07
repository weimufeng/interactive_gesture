// main.js

// ====== 基本 Three.js 场景 ======
let renderer, scene, camera, particleSystem;
let particleMaterial;
let particles, basePositions;
const PARTICLE_COUNT = 9000;

// 用于文字形状的目标位置
const textTargets = {
  1: [], // Hello World!
  2: [], // 我是Sara
  3: [], // 准备好和我一起了吗？
};

let currentGestureNumber = 0;
let handOpenAmount = 0; // 0-1, 用于控制收缩/扩散
let pointerWorld = new THREE.Vector3(); // 手指指尖在 3D 空间中的映射
let hasPointer = false;

const debugEl = document.getElementById("debug");
const statusEl = document.getElementById("status");

function logDebug(text) {
  debugEl.textContent = text;
}

// ====== 初始化摄像头背景 ======
async function initCamera() {
  const video = document.getElementById("camera");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

// ====== 初始化 Three.js 场景 ======
function initThree() {
  const container = document.getElementById("three-container");
  const width = container.clientWidth;
  const height = container.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
  camera.position.set(0, 0, 400);

  scene = new THREE.Scene();

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  basePositions = new Float32Array(PARTICLE_COUNT * 3);

  const spawnRadius = 260;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const r = Math.random() * spawnRadius;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions[i3] = basePositions[i3] = x;
    positions[i3 + 1] = basePositions[i3 + 1] = y;
    positions[i3 + 2] = basePositions[i3 + 2] = z;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  particleMaterial = new THREE.PointsMaterial({
    color: 0xffd166,
    size: 3.0,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
  });

  particleSystem = new THREE.Points(geometry, particleMaterial);
  scene.add(particleSystem);

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  const container = document.getElementById("three-container");
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

// ====== 生成文字形状（使用 2D Canvas 采样） ======
function generateTextPoints(text, targetArray) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const w = 600;
  const h = 200;
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 让文字只占中间小区域：整体缩小字号
  const fontSize = 52;
  ctx.font = `${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.fillText(text, w / 2, h / 2);

  const imgData = ctx.getImageData(0, 0, w, h).data;
  targetArray.length = 0;

  const gap = 4; // 采样间隔
  for (let y = 0; y < h; y += gap) {
    for (let x = 0; x < w; x += gap) {
      const idx = (y * w + x) * 4;
      const alpha = imgData[idx + 3];
      if (alpha > 128) {
        // 将2D坐标映射到 Three.js 空间中间的小区域
        const nx = ((x - w / 2) / w) * 260; // 控制宽度
        const ny = ((h / 2 - y) / h) * 80; // 控制高度
        const nz = 0;
        targetArray.push(new THREE.Vector3(nx, ny, nz));
      }
    }
  }
}

// ====== 根据当前手势编号切换目标文字形状 ======
function getCurrentTextTarget() {
  if (!currentGestureNumber) return null;
  return textTargets[currentGestureNumber] || null;
}

// ====== 更新粒子位置（手势收缩 / 扩散 + 指尖避让） ======
function updateParticles(delta) {
  if (!particleSystem) return;
  const positions = particleSystem.geometry.attributes.position.array;

  const targetPoints = getCurrentTextTarget();
  const useText = !!targetPoints && targetPoints.length > 0;

  // 提高基础聚合强度，加快文字显示速度
  const pullStrength = useText ? Math.max(0.5, 1.2 * handOpenAmount) : 0.9 * handOpenAmount; // 文字模式时最小也有0.5的强度
  const scatterStrength = 1.2 * (1 - handOpenAmount); // 收缩越小，越扩散

  const pointerRadius = 26;
  const pointerForce = 60;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const bx = basePositions[i3];
    const by = basePositions[i3 + 1];
    const bz = basePositions[i3 + 2];

    let tx = bx;
    let ty = by;
    let tz = bz;

    if (useText) {
      const p = targetPoints[i % targetPoints.length];
      tx = p.x;
      ty = p.y;
      tz = p.z;
    }

    let x = positions[i3];
    let y = positions[i3 + 1];
    let z = positions[i3 + 2];

    // 向目标（文字或原始云）插值
    // 当显示文字时使用更高的插值速度，加快聚合速度
    const baseLerpSpeed = useText ? 0.65 : 0.35; // 文字模式使用更快的速度
    const lerpToTarget = pullStrength * baseLerpSpeed;
    x += (tx - x) * lerpToTarget;
    y += (ty - y) * lerpToTarget;
    z += (tz - z) * lerpToTarget;

    // 轻微噪声扩散，避免完全静止
    const noiseScale = 0.6 * scatterStrength;
    if (noiseScale > 0.0001) {
      x += (Math.random() - 0.5) * noiseScale;
      y += (Math.random() - 0.5) * noiseScale;
      z += (Math.random() - 0.5) * noiseScale;
    }

    // 指尖避让：如果有指针且粒子靠近，则沿法线方向推开
    if (hasPointer) {
      const dx = x - pointerWorld.x;
      const dy = y - pointerWorld.y;
      const dz = z - pointerWorld.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < pointerRadius && dist > 0.001) {
        const f = (1 - dist / pointerRadius) * pointerForce * delta;
        x += (dx / dist) * f;
        y += (dy / dist) * f;
        z += (dz / dist) * f;
      }
    }

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;
  }

  particleSystem.geometry.attributes.position.needsUpdate = true;
}

// ====== 手势识别：使用 MediaPipe Hands ======
let hands, mpCamera;

function estimateGesture(hand) {
  // 根据手指伸展情况推断数字 1 / 2 / 3
  // 这里采用非常简化的规则：统计伸直的手指数量
  const landmarks = hand.landmarks;
  if (!landmarks) return 0;

  // 利用 y 坐标判断手指是否伸直（相对指根）
  const fingerIndices = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20],
  };

  function isFingerExtended(indices) {
    const mcp = landmarks[indices[0]]; // 掌指关节
    const tip = landmarks[indices[3]]; // 指尖
    // 在自拍镜像中，y 越小越靠上
    return tip.y < mcp.y - 0.05;
  }

  const extended = {
    index: isFingerExtended(fingerIndices.index),
    middle: isFingerExtended(fingerIndices.middle),
    ring: isFingerExtended(fingerIndices.ring),
    pinky: isFingerExtended(fingerIndices.pinky),
  };

  const count =
    (extended.index ? 1 : 0) +
    (extended.middle ? 1 : 0) +
    (extended.ring ? 1 : 0) +
    (extended.pinky ? 1 : 0);

  // 简单映射：1/2/3 根手指 -> 手势 1/2/3
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 0;
}

function computeOpenAmount(hand) {
  // 使用拇指与中指指尖距离近似衡量张合程度（0-1）
  const lm = hand.landmarks;
  if (!lm) return 0;
  const thumbTip = lm[4];
  const middleTip = lm[12];
  const dx = thumbTip.x - middleTip.x;
  const dy = thumbTip.y - middleTip.y;
  const dz = (thumbTip.z || 0) - (middleTip.z || 0);
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // 距离一般在 0.02 - 0.25 之间，做个归一化
  const minD = 0.03;
  const maxD = 0.20;
  let t = (dist - minD) / (maxD - minD);
  t = Math.min(1, Math.max(0, t));
  return t;
}

function mapTipToWorld(tip, imageWidth, imageHeight) {
  // tip.x/y 是归一化坐标(0-1), 左上角为原点; video 是镜像的
  const xNorm = 1 - tip.x; // 镜像
  const yNorm = tip.y;

  // 映射到屏幕像素坐标
  const container = document.getElementById("three-container");
  const w = container.clientWidth;
  const h = container.clientHeight;
  const sx = xNorm * w;
  const sy = yNorm * h;

  // 变换到 NDC(-1,1)
  const ndcX = (sx / w) * 2 - 1;
  const ndcY = -(sy / h) * 2 + 1;

  // 投射到 z=0 的平面上
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const dir = vec.sub(camera.position).normalize();
  const distance = -camera.position.z / dir.z;
  const pos = camera.position.clone().add(dir.multiplyScalar(distance));
  pointerWorld.copy(pos);
  hasPointer = true;
}

function onResults(results) {
  const handsList = results.multiHandLandmarks || [];
  let gestureNumber = 0;
  let openAmount = 0;
  hasPointer = false;

  if (handsList.length > 0) {
    // 只取第一只手作为主控制手
    const handLm = handsList[0];
    const fakeHand = { landmarks: handLm };

    gestureNumber = estimateGesture(fakeHand);
    openAmount = computeOpenAmount(fakeHand);

    // 取食指指尖作为指针
    const tip = handLm[8];
    if (tip) {
      mapTipToWorld(
        tip,
        results.image.width || 1,
        results.image.height || 1
      );
    }
  }

  currentGestureNumber = gestureNumber;
  handOpenAmount = openAmount;

  statusEl.textContent =
    (gestureNumber ? `手势 ${gestureNumber} ` : "未识别到数字手势 ") +
    `| 张合：${openAmount.toFixed(2)}`;

  logDebug(
    `Hands: ${handsList.length}\nGesture: ${gestureNumber}\nOpen: ${openAmount.toFixed(
      2
    )}\nPointer: ${hasPointer ? "Yes" : "No"}`
  );
}

function initHands() {
  const video = document.getElementById("camera");
  hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });

  hands.onResults(onResults);

  mpCamera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480,
  });
  mpCamera.start();
}

// ====== 颜色选择 UI ======
function initColorUI() {
  const palette = document.getElementById("color-palette");
  palette.addEventListener("click", (e) => {
    const dot = e.target.closest(".color-dot");
    if (!dot) return;
    const color = dot.dataset.color;
    if (particleMaterial) {
      particleMaterial.color = new THREE.Color(color);
    }
    palette.querySelectorAll(".color-dot").forEach((d) => {
      d.dataset.active = d === dot ? "true" : "false";
    });
  });
}

// ====== 动画循环 ======
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  updateParticles(delta);
  renderer.render(scene, camera);
}

// ====== 初始化入口 ======
async function init() {
  try {
    statusEl.textContent = "请求摄像头权限...";
    await initCamera();
    statusEl.textContent = "初始化粒子系统...";
    initThree();

    statusEl.textContent = "生成文字粒子形状...";
    generateTextPoints("Hello World!", textTargets[1]);
    generateTextPoints("我是Sara", textTargets[2]);
    generateTextPoints("准备好和我一起了吗？", textTargets[3]);

    initColorUI();

    statusEl.textContent = "加载手势识别模型...";
    initHands();

    statusEl.textContent = "请抬起手做 1 / 2 / 3 手势，并通过张合控制粒子收缩与扩散";

    animate();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "初始化失败，请检查摄像头权限或控制台日志。";
  }
}

window.addEventListener("DOMContentLoaded", init);


