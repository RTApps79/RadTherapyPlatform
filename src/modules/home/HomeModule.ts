/**
 * RTApps RadTherapyPlatform — Home / Dashboard Module
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * The default landing module. Two jobs in Phase 1:
 *   1. Give a real, working demonstration that the foundation (module host,
 *      router, event bus, state store, service container) is wired up.
 *   2. Prove out the RenderingService/Three.js integration point with a
 *      live 3D viewport, so later modules (LINAC/gantry visualization in
 *      Treatment Delivery, beam geometry in TPS, anatomy review) have a
 *      working pattern to build from rather than a paper design.
 */

import * as THREE from "three";
import type { ModuleDefinition, ModuleContext } from "@core/types";
import { branding } from "@config/branding";
import { RenderingServiceToken } from "@services/tokens";

function buildGantryMesh(): THREE.Group {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.06, 16, 64),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.4, roughness: 0.35 }),
  );
  group.add(ring);

  const couch = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.08, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8fa6c2, metalness: 0.2, roughness: 0.6 }),
  );
  couch.position.y = -0.05;
  group.add(couch);

  const isocenterMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf87171, emissive: 0xf87171, emissiveIntensity: 0.6 }),
  );
  group.add(isocenterMarker);

  return group;
}

const WORKFLOW_ORDER = [
  "Patient Library",
  "Consultation / OIS",
  "CT Simulation",
  "DICOM Studio",
  "Dosimetry / TPS",
  "Physics QA",
  "Treatment Delivery",
  "OTV / Adaptive Review",
  "Completion",
  "Education / Assessment",
];

export const HomeModule: ModuleDefinition = {
  id: "home",
  title: "Platform Home",
  description: "Foundation status, architecture overview, and workflow map.",
  order: 0,
  status: "active",
  mount(context: ModuleContext) {
    const { container, services, logger } = context;

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; align-items: start;">
        <div class="rtapps-panel">
          <span class="rtapps-badge rtapps-badge--accent">Phase 1 — Platform Foundation</span>
          <h2 style="margin-top: 12px;">${branding.productFullName}</h2>
          <p style="color: var(--rtapps-text-secondary);">${branding.tagline}</p>
          <p style="color: var(--rtapps-text-secondary); font-size: 13px; line-height: 1.6;">
            This shell demonstrates the module host, hash router, event bus, state store,
            service container, and shared dataset registry described in the architecture
            brief. Use the navigation on the left to visit each workflow area — most render
            a placeholder until their phase lands.
          </p>
          <div id="rtapps-home-workflow" style="margin-top: 16px;"></div>
        </div>

        <div class="rtapps-panel" style="display: flex; flex-direction: column;">
          <span class="rtapps-badge">3D Rendering Service — live demo</span>
          <p style="color: var(--rtapps-text-muted); font-size: 12px; margin: 8px 0 12px;">
            Three.js viewport created via the shared <code>RenderingService</code>. Later
            modules reuse this same service for gantry visualization, beam geometry, and
            anatomy review.
          </p>
          <div id="rtapps-home-viewport" style="flex: 1; min-height: 260px; border-radius: var(--rtapps-radius-md); overflow: hidden; border: 1px solid var(--rtapps-panel-border);"></div>
        </div>
      </div>

      <p style="color: var(--rtapps-text-muted); font-size: 12px; margin-top: 18px;">
        ${branding.nonClinicalDisclaimer}
      </p>
    `;

    // Workflow step list, data-driven rather than hardcoded per-module UI.
    const workflowEl = container.querySelector<HTMLDivElement>("#rtapps-home-workflow")!;
    workflowEl.innerHTML = WORKFLOW_ORDER.map(
      (stage, i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:6px 0; font-size:13px; color:var(--rtapps-text-secondary);">
          <span style="font-family:var(--rtapps-font-mono); color:var(--rtapps-text-muted); width:18px;">${i + 1}</span>
          <span>${stage}</span>
        </div>`,
    ).join("");

    // 3D viewport via the shared RenderingService.
    const viewportEl = container.querySelector<HTMLDivElement>("#rtapps-home-viewport")!;
    const rendering = services.resolve(RenderingServiceToken);
    const viewport = rendering.createViewport(viewportEl);

    const gantry = buildGantryMesh();
    viewport.scene.add(gantry);

    const stopTick = viewport.onTick((delta) => {
      gantry.rotation.y += delta * 0.4;
    });

    logger.info("Home module mounted with live 3D viewport");

    return () => {
      stopTick();
      viewport.dispose();
    };
  },
};
