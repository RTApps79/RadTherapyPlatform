/**
 * RTApps RadTherapyPlatform — Patient Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Phase 1 in-memory implementation of the shared patient library. The
 * public interface is what matters for now — Phase 5 (Patient Library
 * Integration) swaps the storage layer (IndexedDB / REST / cloud) behind
 * this same interface without any module code changing.
 */

import type { EventBus } from "@core/EventBus";
import type { PlatformEvents } from "@core/PlatformEvents";
import type { Patient, EntityId } from "@models/index";

export interface PatientSearchFilters {
  freeText?: string;
  cancerSite?: string;
  diagnosis?: string;
  stage?: string;
  treatmentIntent?: Patient["treatmentIntent"];
  difficulty?: Patient["difficulty"];
  competency?: string;
}

export class PatientService {
  private patients = new Map<EntityId, Patient>();

  constructor(private readonly eventBus: EventBus<PlatformEvents>) {}

  create(input: Omit<Patient, "id" | "createdAt" | "updatedAt">): Patient {
    const now = new Date().toISOString();
    const patient: Patient = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.patients.set(patient.id, patient);
    return patient;
  }

  get(id: EntityId): Patient | undefined {
    return this.patients.get(id);
  }

  list(): Patient[] {
    return [...this.patients.values()];
  }

  update(id: EntityId, patch: Partial<Omit<Patient, "id" | "createdAt">>): Patient {
    const existing = this.patients.get(id);
    if (!existing) {
      throw new Error(`PatientService: no patient with id "${id}"`);
    }
    const updated: Patient = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.patients.set(id, updated);
    this.eventBus.emit("patient:updated", { patientId: id });
    return updated;
  }

  delete(id: EntityId): void {
    this.patients.delete(id);
  }

  select(id: EntityId): void {
    this.eventBus.emit("patient:selected", { patientId: id });
  }

  /** Search covering the fields called out in the Patient Library brief. */
  search(filters: PatientSearchFilters): Patient[] {
    return this.list().filter((patient) => {
      if (filters.freeText) {
        const haystack = `${patient.firstName} ${patient.lastName} ${patient.mrn}`.toLowerCase();
        if (!haystack.includes(filters.freeText.toLowerCase())) return false;
      }
      if (filters.cancerSite && patient.cancerSite !== filters.cancerSite) return false;
      if (filters.diagnosis && patient.diagnosis !== filters.diagnosis) return false;
      if (filters.stage && patient.stage !== filters.stage) return false;
      if (filters.treatmentIntent && patient.treatmentIntent !== filters.treatmentIntent) return false;
      if (filters.difficulty && patient.difficulty !== filters.difficulty) return false;
      if (filters.competency && !(patient.competencies ?? []).includes(filters.competency)) return false;
      return true;
    });
  }
}
