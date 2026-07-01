/**
 * RTApps RadTherapyPlatform — Platform Event Map
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * The single, growing catalog of domain events modules may publish or
 * subscribe to. Add new event types here as later phases introduce
 * imaging, planning, QA, and delivery events — keep it centralized so the
 * full set of cross-module contracts stays discoverable in one file.
 */

import type { EventMap } from "./types";

export interface PlatformEvents extends EventMap {
  "patient:selected": { patientId: string };
  "patient:updated": { patientId: string };

  "dataset:registered": { datasetId: string; studyId: string; modality: string };
  "dataset:opened": { datasetId: string; moduleId: string };

  "workflow:stage-changed": { caseId: string; stage: string };
  "workflow:case-completed": { caseId: string };

  "module:mounted": { moduleId: string };
  "module:unmounted": { moduleId: string };

  "route:changed": { moduleId: string };

  "notification:info": { message: string };
  "notification:warning": { message: string };
  "notification:error": { message: string };
}
