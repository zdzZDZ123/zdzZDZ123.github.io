export const CONFIG = {
  camera: {
    fov: 60,
    near: 0.1,
    far: 400,
    initialRadius: 58,
    minRadius: 28,
    maxRadius: 86,
    rotateSensitivity: 3.8,
    zoomLerpFactor: 0.08,
    targetRadiusLerpFactor: 0.25,
  },
  gesture: {
    smoothingFactor: 0.28,
    minOpenness: 0.055,
    maxOpenness: 0.16,
    fingerBendThreshold: -0.015,
    minExtendedFingersForOpen: 4,
    maxExtendedFingersForFist: 0,
  },
  scene: {
    backgroundColor: 0x040610,
    fogColor: 0x040610,
    fogNear: 36,
    fogFar: 140,
  },
  starfield: {
    radius: 48,
    starCount: 360,
    planetCount: 5,
    backgroundStarCount: 2200,
    rotationSpeed: 0.045,
    backgroundRotationSpeed: 0.01,
  },
  ui: {
    highlightClearDelay: 2200,
    noGestureClearDelay: 800,
    highlightEmptyClearDelay: 600,
  }
};
