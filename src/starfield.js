import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const DEFAULTS = {
  radius: 48,
  starCount: 360,
  planetCount: 5,
  backgroundStarCount: 2200,
};

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randomVectorOnSphere(radius) {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius * Math.cbrt(Math.random());
  const sinPhi = Math.sin(phi);

  return new THREE.Vector3(
    r * Math.cos(theta) * sinPhi,
    r * Math.cos(phi),
    r * Math.sin(theta) * sinPhi
  );
}

function createGlowingMaterial({ color, emissiveIntensity = 0.85 }) {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity,
    metalness: 0.2,
    roughness: 0.35,
  });
  return material;
}

export class Starfield {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = { ...DEFAULTS, ...options };

    this.group = new THREE.Group();
    this.backgroundGroup = new THREE.Group();
    this.pickableObjects = [];
    this.highlighted = null;

    this._buildBackground();
    this._buildStars();
    this._buildPlanets();
    this._setupLights();

    scene.add(this.backgroundGroup);
    scene.add(this.group);
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0x223366, 0.8);
    this.scene.add(ambient);

    const rimLight = new THREE.DirectionalLight(0xcad6ff, 1.2);
    rimLight.position.set(1.2, 1.8, 2.8);
    this.scene.add(rimLight);

    const fillLight = new THREE.PointLight(0x1d3df5, 60, 120, 2.2);
    fillLight.position.set(-24, -30, -36);
    this.scene.add(fillLight);
  }

  _buildBackground() {
    const positions = new Float32Array(this.options.backgroundStarCount * 3);
    const colors = new Float32Array(this.options.backgroundStarCount * 3);
    const color = new THREE.Color();

    for (let i = 0; i < this.options.backgroundStarCount; i += 1) {
      const position = randomVectorOnSphere(this.options.radius * 1.1 + Math.random() * 12);
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      color.setHSL(0.55 + Math.random() * 0.12, 0.7 + Math.random() * 0.25, 0.7 + Math.random() * 0.25);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });

    const points = new THREE.Points(geometry, material);
    this.backgroundGroup.add(points);
  }

  _buildStars() {
    const color = new THREE.Color();

    for (let i = 0; i < this.options.starCount; i += 1) {
      const star = new THREE.SphereGeometry(randomInRange(0.18, 0.45), 12, 12);
      color.setHSL(0.52 + Math.random() * 0.18, 0.75, 0.67 + Math.random() * 0.1);
      const material = createGlowingMaterial({ color: color.clone(), emissiveIntensity: 1.05 });
      const mesh = new THREE.Mesh(star, material);
      const position = randomVectorOnSphere(this.options.radius * 0.92);
      mesh.position.copy(position);
      mesh.userData = {
        type: "star",
        label: `星辰 ${i + 1}`,
        kindLabel: "恒星",
        baseEmissive: material.emissive.clone(),
        baseEmissiveIntensity: material.emissiveIntensity,
        baseScale: mesh.scale.clone(),
      };

      this.group.add(mesh);
      this.pickableObjects.push(mesh);
    }
  }

  _buildPlanets() {
    const color = new THREE.Color();

    for (let i = 0; i < this.options.planetCount; i += 1) {
      const geometry = new THREE.SphereGeometry(randomInRange(1.2, 2.4), 24, 24);
      color.setHSL(Math.random(), 0.5, 0.55);
      const material = new THREE.MeshStandardMaterial({
        color: color.clone(),
        emissive: color.clone().multiplyScalar(0.35),
        emissiveIntensity: 0.8,
        metalness: 0.45,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const position = randomVectorOnSphere(this.options.radius * 0.75);
      mesh.position.copy(position);

      const ringCount = Math.random() > 0.6 ? 2 : 0;
      if (ringCount) {
        this._createPlanetRings(mesh);
      }

      mesh.userData = {
        type: "planet",
        label: `行星 ${i + 1}`,
        kindLabel: "行星",
        baseEmissive: material.emissive.clone(),
        baseEmissiveIntensity: material.emissiveIntensity,
        baseScale: mesh.scale.clone(),
      };

      this.group.add(mesh);
      this.pickableObjects.push(mesh);
    }
  }

  _createPlanetRings(planet) {
    const ringGeometry = new THREE.RingGeometry(planet.geometry.parameters.radius * 1.3, planet.geometry.parameters.radius * 1.8, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xaad4ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotateX(Math.PI / 2.6 + Math.random() * 0.4);
    planet.add(ring);
  }

  getPickableObjects() {
    return this.pickableObjects;
  }

  update(deltaTime) {
    this.group.rotation.y += deltaTime * 0.045;
    this.backgroundGroup.rotation.y += deltaTime * 0.01;
  }

  clearHighlight() {
    if (!this.highlighted) return;

    const { material, userData } = this.highlighted;
    if (material && userData?.baseEmissive) {
      material.emissive.copy(userData.baseEmissive);
      if (typeof userData.baseEmissiveIntensity === "number") {
        material.emissiveIntensity = userData.baseEmissiveIntensity;
      }
    }

    if (userData?.baseScale) {
      this.highlighted.scale.copy(userData.baseScale);
    }

    delete this.highlighted.userData.isHighlighted;
    this.highlighted = null;
  }

  highlight(object) {
    if (!object) {
      this.clearHighlight();
      return;
    }

    if (this.highlighted && this.highlighted !== object) {
      this.clearHighlight();
    }

    const { material } = object;
    if (material) {
      material.emissiveIntensity = 1.6;
      material.emissive.setHex(0xf0f6ff);
    }
    object.scale.multiplyScalar(1.3);
    object.userData.isHighlighted = true;
    this.highlighted = object;
  }
}
