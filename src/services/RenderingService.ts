/**
 * RTApps RadTherapyPlatform — Rendering Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Shared Three.js abstraction so every module that needs a 3D viewport
 * (LINAC/gantry visualization, beam geometry, anatomy review, dose clouds)
 * creates its scene through the same service instead of each module
 * standing up its own renderer/resize/dispose boilerplate.
 *
 * Volumetric rendering (CT/dose volumes) will layer vtk.js on top of this
 * in Phase 3+; this service only owns the Three.js scene graph layer.
 */

import * as THREE from "three";
import type { Logger } from "@core/Logger";

export interface Rtapps3DViewportHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Register a callback invoked once per animation frame, e.g. for rotation. */
  onTick(callback: (deltaSeconds: number) => void): () => void;
  dispose(): void;
}

export class RenderingService {
  constructor(private readonly logger: Logger) {}

  /**
   * Create a self-contained 3D viewport mounted into `container`, with a
   * resize observer and animation loop already wired up. Callers add their
   * own meshes to `scene` and register per-frame logic via `onTick`.
   */
  createViewport(container: HTMLElement, options?: { backgroundHex?: number }): Rtapps3DViewportHandle {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(options?.backgroundHex ?? 0x0a1420);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      1000,
    );
    camera.position.set(3, 2.2, 4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x8fa6c2, 0.6);
    const key = new THREE.DirectionalLight(0x22d3ee, 1.1);
    key.position.set(4, 6, 3);
    scene.add(ambient, key);

    const tickCallbacks = new Set<(deltaSeconds: number) => void>();
    let lastTime = performance.now();
    let animationFrameId = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      tickCallbacks.forEach((cb) => cb(delta));
      renderer.render(scene, camera);
    };
    animationFrameId = requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    this.logger.debug("3D viewport created", {
      width: container.clientWidth,
      height: container.clientHeight,
    });

    return {
      scene,
      camera,
      renderer,
      onTick: (callback) => {
        tickCallbacks.add(callback);
        return () => tickCallbacks.delete(callback);
      },
      dispose: () => {
        cancelAnimationFrame(animationFrameId);
        resizeObserver.disconnect();
        renderer.dispose();
        if (renderer.domElement.parentElement === container) {
          container.removeChild(renderer.domElement);
        }
        this.logger.debug("3D viewport disposed");
      },
    };
  }
}
