/**
 * RTApps RadTherapyPlatform — Workflow Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Tracks where a given case sits in the canonical workflow:
 * Patient Library -> Consultation/OIS -> CT Simulation -> DICOM Studio ->
 * Dosimetry/TPS -> Physics QA -> Treatment Delivery -> OTV/Adaptive Review
 * -> Completion -> Education/Assessment
 *
 * This is what lets the shell render workflow progress (e.g. the numbered
 * step indicators in the product mockups) generically, driven by data
 * rather than by hardcoded per-module UI.
 */

import type { EventBus } from "@core/EventBus";
import type { PlatformEvents } from "@core/PlatformEvents";
import { WORKFLOW_STAGES, type WorkflowStage, type EntityId } from "@models/index";

export interface CaseWorkflowState {
  caseId: EntityId;
  patientId: EntityId;
  currentStage: WorkflowStage;
  completedStages: WorkflowStage[];
}

export class WorkflowService {
  private cases = new Map<EntityId, CaseWorkflowState>();

  constructor(private readonly eventBus: EventBus<PlatformEvents>) {}

  startCase(caseId: EntityId, patientId: EntityId): CaseWorkflowState {
    const state: CaseWorkflowState = {
      caseId,
      patientId,
      currentStage: WORKFLOW_STAGES[0],
      completedStages: [],
    };
    this.cases.set(caseId, state);
    return state;
  }

  getCase(caseId: EntityId): CaseWorkflowState | undefined {
    return this.cases.get(caseId);
  }

  advanceTo(caseId: EntityId, stage: WorkflowStage): CaseWorkflowState {
    const state = this.cases.get(caseId);
    if (!state) throw new Error(`WorkflowService: no case with id "${caseId}"`);

    if (!state.completedStages.includes(state.currentStage)) {
      state.completedStages.push(state.currentStage);
    }
    state.currentStage = stage;
    this.eventBus.emit("workflow:stage-changed", { caseId, stage });

    if (stage === "completion") {
      this.eventBus.emit("workflow:case-completed", { caseId });
    }
    return state;
  }

  stageIndex(stage: WorkflowStage): number {
    return WORKFLOW_STAGES.indexOf(stage);
  }

  allStages(): readonly WorkflowStage[] {
    return WORKFLOW_STAGES;
  }
}
