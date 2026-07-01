/**
 * RTApps RadTherapyPlatform — Service Bootstrap
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Single place where every core service gets registered into the
 * ServiceContainer. main.ts calls this once at startup. Modules never
 * construct services themselves — they resolve them from the container
 * using the tokens exported from ./tokens.
 */

import type { ServiceContainer } from "@core/ServiceContainer";
import type { EventBus } from "@core/EventBus";
import type { PlatformEvents } from "@core/PlatformEvents";
import type { Logger } from "@core/Logger";

import { PatientService } from "./PatientService";
import { CourseService } from "./CourseService";
import { StudySeriesService } from "./StudySeriesService";
import { ImagingDatasetRegistry } from "./ImagingDatasetRegistry";
import { DicomImportService } from "./DicomImportService";
import { PlanService } from "./PlanService";
import { WorkflowService } from "./WorkflowService";
import { RenderingService } from "./RenderingService";

import {
  PatientServiceToken,
  CourseServiceToken,
  StudySeriesServiceToken,
  ImagingDatasetRegistryToken,
  DicomImportServiceToken,
  PlanServiceToken,
  WorkflowServiceToken,
  RenderingServiceToken,
} from "./tokens";

export function registerCoreServices(
  services: ServiceContainer,
  eventBus: EventBus<PlatformEvents>,
  logger: Logger,
): void {
  services.registerSingleton(PatientServiceToken, () => new PatientService(eventBus));
  services.registerSingleton(CourseServiceToken, () => new CourseService());
  services.registerSingleton(StudySeriesServiceToken, () => new StudySeriesService());
  services.registerSingleton(ImagingDatasetRegistryToken, () => new ImagingDatasetRegistry(eventBus));

  services.registerSingleton(
    DicomImportServiceToken,
    (c) =>
      new DicomImportService(
        c.resolve(StudySeriesServiceToken),
        c.resolve(ImagingDatasetRegistryToken),
        logger.scope("DicomImportService"),
      ),
  );

  services.registerSingleton(PlanServiceToken, () => new PlanService());
  services.registerSingleton(WorkflowServiceToken, () => new WorkflowService(eventBus));
  services.registerSingleton(RenderingServiceToken, () => new RenderingService(logger.scope("RenderingService")));
}

export * from "./tokens";
export { PatientService } from "./PatientService";
export { CourseService } from "./CourseService";
export { StudySeriesService } from "./StudySeriesService";
export { ImagingDatasetRegistry } from "./ImagingDatasetRegistry";
export { DicomImportService } from "./DicomImportService";
export { PlanService } from "./PlanService";
export { WorkflowService } from "./WorkflowService";
export { RenderingService } from "./RenderingService";
