/**
 * RTApps RadTherapyPlatform — Service Tokens
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * One token per shared service named in the architecture brief. Modules
 * resolve services via `services.resolve(PatientServiceToken)` etc. rather
 * than importing concrete classes directly, keeping module code decoupled
 * from *how* a service is implemented (in-memory today, REST/IndexedDB/
 * cloud-backed later).
 */

import { createToken } from "@core/ServiceContainer";
import type { PatientService } from "./PatientService";
import type { CourseService } from "./CourseService";
import type { StudySeriesService } from "./StudySeriesService";
import type { ImagingDatasetRegistry } from "./ImagingDatasetRegistry";
import type { DicomImportService } from "./DicomImportService";
import type { PlanService } from "./PlanService";
import type { WorkflowService } from "./WorkflowService";
import type { RenderingService } from "./RenderingService";
import type { PatientLibraryService } from "./PatientLibraryService";

export const PatientServiceToken = createToken<PatientService>("PatientService");
export const CourseServiceToken = createToken<CourseService>("CourseService");
export const StudySeriesServiceToken = createToken<StudySeriesService>("StudySeriesService");
export const ImagingDatasetRegistryToken = createToken<ImagingDatasetRegistry>("ImagingDatasetRegistry");
export const DicomImportServiceToken = createToken<DicomImportService>("DicomImportService");
export const PlanServiceToken = createToken<PlanService>("PlanService");
export const WorkflowServiceToken = createToken<WorkflowService>("WorkflowService");
export const RenderingServiceToken = createToken<RenderingService>("RenderingService");
export const PatientLibraryServiceToken = createToken<PatientLibraryService>("PatientLibraryService");
