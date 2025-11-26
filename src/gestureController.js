import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const MODEL_ASSET_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm";

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18];
const FINGER_MCP = [2, 5, 9, 13, 17];

function lerp(current, target, smoothing) {
  return current + (target - current) * smoothing;
}

function distance3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}

function subtract3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}

function computeFingerStates(worldLandmarks) {
  const states = [];
  for (let i = 0; i < 5; i += 1) {
    const tipIndex = FINGER_TIPS[i];
    const pipIndex = FINGER_PIPS[i];
    const mcpIndex = FINGER_MCP[i];

    const tip = worldLandmarks[tipIndex];
    const pip = worldLandmarks[pipIndex];
    const mcp = worldLandmarks[mcpIndex];

    const v1 = subtract3(tip, pip);
    const v2 = subtract3(mcp, pip);
    const dot = dot3(v1, v2);

    states.push(dot < -0.015);
  }
  return states;
}

function computeOpenness(worldLandmarks) {
  const wrist = worldLandmarks[0];
  const tipIndices = [8, 12, 16, 20];
  let sum = 0;
  tipIndices.forEach((index) => {
    sum += distance3(wrist, worldLandmarks[index]);
  });
  return sum / tipIndices.length;
}

function determineGesture(fingerStates) {
  const extendedCount = fingerStates.filter(Boolean).length;

  if (extendedCount >= 4) {
    return "open";
  }

  if (extendedCount === 0) {
    return "fist";
  }

  if (fingerStates[1] && !fingerStates[0] && !fingerStates[2] && !fingerStates[3] && !fingerStates[4]) {
    return "point";
  }

  return "neutral";
}

function resizeCanvasToDisplaySize(canvas, video) {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return;

  if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
    canvas.width = videoWidth;
    canvas.height = videoHeight;
  }
}

export class GestureController {
  constructor(videoElement, canvasElement, options = {}) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.ctx = canvasElement.getContext("2d", { alpha: true });

    this.listeners = new Map();
    this.running = false;
    this.ready = false;

    this.options = {
      smoothingFactor: 0.28,
      maxFPS: 60,
      ...options,
    };

    this.model = null;
    this.lastVideoTime = -1;
    this.prevHandPosition = null;
    this.smoothed = {
      openness: 0,
      position: { x: 0, y: 0 },
    };
  }

  async initialize() {
    try {
      const fileset = await FilesetResolver.forVisionTasks(MODEL_ASSET_BASE);
      this.model = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_ASSET_BASE}/hand_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });
      this.ready = true;
      this._emit("status", { message: "手势识别已就绪" });
    } catch (error) {
      this._emit("error", error);
      throw error;
    }
  }

  start() {
    if (!this.ready || this.running) return;
    this.running = true;
    this.lastVideoTime = -1;
    this._loop();
  }

  stop() {
    this.running = false;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  _emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => {
      handler(payload);
    });
  }

  _loop() {
    if (!this.running) return;

    const processFrame = () => {
      if (!this.model) {
        this._emit("error", new Error("手势模型尚未加载"));
        this.running = false;
        return;
      }

      const currentTime = this.videoElement.currentTime;
      if (currentTime === this.lastVideoTime) {
        requestAnimationFrame(this._loop.bind(this));
        return;
      }
      this.lastVideoTime = currentTime;

      if (!this.videoElement.videoWidth || !this.videoElement.videoHeight) {
        requestAnimationFrame(this._loop.bind(this));
        return;
      }

      const results = this.model.detectForVideo(this.videoElement, performance.now());

      this._drawDetections(results);
      if (results.landmarks?.length) {
        const [landmarks] = results.landmarks;
        const [worldLandmarks] = results.worldLandmarks;
        const data = this._analyzeLandmarks(landmarks, worldLandmarks);
        this._emit("update", data);
      } else {
        this.prevHandPosition = null;
        this._emit("update", { gesture: "none", present: false });
      }

      requestAnimationFrame(this._loop.bind(this));
    };

    requestAnimationFrame(processFrame);
  }

  _drawDetections(results) {
    const { ctx } = this;
    if (!ctx) return;
    resizeCanvasToDisplaySize(this.canvasElement, this.videoElement);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (!results.landmarks?.length) return;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(118, 173, 255, 0.9)";
    ctx.fillStyle = "rgba(118, 173, 255, 1)";

    const [landmarks] = results.landmarks;

    HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      ctx.beginPath();
      ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
      ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
      ctx.stroke();
    });

    landmarks.forEach((landmark, index) => {
      const radius = FINGER_TIPS.includes(index) ? 6 : 4;
      ctx.beginPath();
      ctx.arc(landmark.x * ctx.canvas.width, landmark.y * ctx.canvas.height, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  _analyzeLandmarks(landmarks, worldLandmarks) {
    const fingerStates = computeFingerStates(worldLandmarks);
    const gesture = determineGesture(fingerStates);
    const openness = computeOpenness(worldLandmarks);

    const smoothing = this.options.smoothingFactor;
    this.smoothed.openness = lerp(this.smoothed.openness, openness, smoothing);

    const wrist = landmarks[0];
    const position = { x: 1 - wrist.x, y: wrist.y };
    this.smoothed.position = {
      x: lerp(this.smoothed.position.x, position.x, smoothing),
      y: lerp(this.smoothed.position.y, position.y, smoothing),
    };

    let movement = { x: 0, y: 0 };
    if (this.prevHandPosition) {
      movement = {
        x: this.smoothed.position.x - this.prevHandPosition.x,
        y: this.smoothed.position.y - this.prevHandPosition.y,
      };
    }
    this.prevHandPosition = { ...this.smoothed.position };

    const indexTip = landmarks[8];
    const pointer = {
      x: indexTip.x,
      y: indexTip.y,
    };

    return {
      gesture,
      present: true,
      openness: this.smoothed.openness,
      fingerStates,
      position: this.smoothed.position,
      movement,
      pointer,
    };
  }
}
