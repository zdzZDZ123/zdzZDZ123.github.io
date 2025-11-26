import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { Starfield } from "./starfield.js";
import { GestureController } from "./gestureController.js";
import { CONFIG } from "./config.js";

const gestureStatusEl = document.getElementById("gesture-status");
const selectionStatusEl = document.getElementById("selection-status");
const fullscreenBtn = document.getElementById("fullscreen-toggle");
const settingsBtn = document.getElementById("settings-toggle");
const closeSettingsBtn = document.getElementById("close-settings");
const settingsPanel = document.getElementById("settings-panel");
const rotationSpeedInput = document.getElementById("rotation-speed");
const sensitivityInput = document.getElementById("sensitivity");
const videoEl = document.getElementById("hand-video");
const handCanvas = document.getElementById("hand-canvas");
const canvas = document.getElementById("star-canvas");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.scene.backgroundColor);
scene.fog = new THREE.Fog(CONFIG.scene.fogColor, CONFIG.scene.fogNear, CONFIG.scene.fogFar);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, CONFIG.camera.near, CONFIG.camera.far);
scene.add(camera);

const starfield = new Starfield(scene);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const cameraState = {
  radius: CONFIG.camera.initialRadius,
  theta: Math.PI * 0.45,
  phi: Math.PI * 0.5,
  targetRadius: CONFIG.camera.initialRadius,
};

let activeSelection = null;
let clearHighlightTimer = null;
let gestureController;

function updateRendererSize() {
  const { clientWidth, clientHeight } = canvas;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

if (typeof ResizeObserver !== "undefined") {
  const resizeObserver = new ResizeObserver(updateRendererSize);
  resizeObserver.observe(canvas.parentElement);
}
window.addEventListener("resize", updateRendererSize);
updateRendererSize();

function mapOpennessToRadius(openness) {
  const { minOpenness, maxOpenness } = CONFIG.gesture;
  const { minRadius, maxRadius } = CONFIG.camera;

  const clamped = Math.min(Math.max(openness, minOpenness), maxOpenness);
  const ratio = (clamped - minOpenness) / (maxOpenness - minOpenness);
  return minRadius + ratio * (maxRadius - minRadius);
}

function updateCamera(movement) {
  if (movement) {
    cameraState.theta += movement.x * CONFIG.camera.rotateSensitivity;
    cameraState.phi += movement.y * CONFIG.camera.rotateSensitivity;
    const epsilon = 0.16;
    cameraState.phi = Math.min(Math.max(cameraState.phi, epsilon), Math.PI - epsilon);
  }

  cameraState.radius = THREE.MathUtils.lerp(cameraState.radius, cameraState.targetRadius, CONFIG.camera.zoomLerpFactor);

  const x = cameraState.radius * Math.sin(cameraState.phi) * Math.cos(cameraState.theta);
  const y = cameraState.radius * Math.cos(cameraState.phi);
  const z = cameraState.radius * Math.sin(cameraState.phi) * Math.sin(cameraState.theta);

  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}

function translateGestureLabel(gesture) {
  switch (gesture) {
    case "open":
      return "手势：张开手掌（拉远视角）";
    case "fist":
      return "手势：握拳（拉近视角）";
    case "point":
      return "手势：指向（选中星体）";
    case "neutral":
      return "手势：自然放松";
    case "none":
    default:
      return "手势：未检测到手部";
  }
}

function scheduleHighlightClear(delay = CONFIG.ui.highlightClearDelay) {
  if (clearHighlightTimer) {
    clearTimeout(clearHighlightTimer);
  }
  clearHighlightTimer = setTimeout(() => {
    starfield.clearHighlight();
    activeSelection = null;
    selectionStatusEl.textContent = "尚未选中星体";
  }, delay);
}

function updateSelection(pointerCoords) {
  const mirroredX = 1 - pointerCoords.x;
  pointer.set(mirroredX * 2 - 1, -(pointerCoords.y * 2 - 1));

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(starfield.getPickableObjects(), false);

  if (intersects.length === 0) {
    scheduleHighlightClear(CONFIG.ui.highlightEmptyClearDelay);
    return;
  }

  const [{ object }] = intersects;
  if (activeSelection !== object) {
    activeSelection = object;
    starfield.highlight(object);
    const { label, kindLabel, temperature, mass, atmosphere, gravity, type } = object.userData;
    let details = "";
    if (type === "star") {
      details = ` | 温: ${temperature} | 质: ${mass}`;
    } else {
      details = ` | 大气: ${atmosphere} | 重力: ${gravity}`;
    }
    selectionStatusEl.textContent = `${label}（${kindLabel}）${details}`;
  }
  scheduleHighlightClear(CONFIG.ui.highlightClearDelay);
}

function renderLoop() {
  const delta = clock.getDelta();
  starfield.update(delta);
  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}

async function setupCameraStream() {
  const constraints = {
    video: {
      facingMode: "user",
      width: { ideal: 960 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;
    await videoEl.play();
  } catch (error) {
    gestureStatusEl.textContent = "摄像头权限被拒绝，请启用以体验手势控制";
    throw error;
  }
}

async function initGestures() {
  gestureController = new GestureController(videoEl, handCanvas);
  gestureController.on("status", ({ message }) => {
    gestureStatusEl.textContent = message;
  });
  gestureController.on("error", (error) => {
    gestureStatusEl.textContent = `手势识别出错：${error.message}`;
  });
  gestureController.on("update", (data) => {
    const { gesture, present, openness, movement, pointer: pointerCoords } = data;

    if (!present) {
      gestureStatusEl.textContent = translateGestureLabel("none");
      scheduleHighlightClear(CONFIG.ui.noGestureClearDelay);
      return;
    }

    gestureStatusEl.textContent = translateGestureLabel(gesture);

    const radius = mapOpennessToRadius(openness);
    cameraState.targetRadius = THREE.MathUtils.lerp(cameraState.targetRadius, radius, CONFIG.camera.targetRadiusLerpFactor);

    if (movement) {
      updateCamera(movement);
    }

    if (gesture === "point" && pointerCoords) {
      updateSelection(pointerCoords);
    }
  });

  await gestureController.initialize();
  gestureController.start();
}

function setupFullscreenToggle() {
  function updateButtonLabel() {
    fullscreenBtn.textContent = document.fullscreenElement ? "退出全屏" : "进入全屏";
  }

  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  document.addEventListener("fullscreenchange", updateButtonLabel);
  updateButtonLabel();
}

function setupSettings() {
  settingsBtn.addEventListener("click", () => {
    settingsPanel.classList.remove("hidden");
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.add("hidden");
  });

  rotationSpeedInput.value = CONFIG.starfield.rotationSpeed;
  rotationSpeedInput.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    CONFIG.starfield.rotationSpeed = val;
    starfield.options.rotationSpeed = val; // Force update
  });

  sensitivityInput.value = CONFIG.camera.rotateSensitivity;
  sensitivityInput.addEventListener("input", (e) => {
    CONFIG.camera.rotateSensitivity = parseFloat(e.target.value);
  });
}

async function bootstrap() {
  renderLoop();
  setupFullscreenToggle();
  setupSettings();
  try {
    await setupCameraStream();
    await initGestures();
  } catch (error) {
    console.error("Failed to initialize gestures", error);
  }
}

bootstrap();
