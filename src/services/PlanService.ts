/**
 * RTApps RadTherapyPlatform — Plan Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 */

import type { TreatmentPlan, Dose, EntityId } from "@models/index";

export class PlanService {
  private plans = new Map<EntityId, TreatmentPlan>();
  private doses = new Map<EntityId, Dose>();

  createPlan(input: Omit<TreatmentPlan, "id" | "createdAt" | "updatedAt" | "status"> & { status?: TreatmentPlan["status"] }): TreatmentPlan {
    const now = new Date().toISOString();
    const plan: TreatmentPlan = {
      ...input,
      status: input.status ?? "draft",
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  getPlan(id: EntityId): TreatmentPlan | undefined {
    return this.plans.get(id);
  }

  listPlansForCourse(courseId: EntityId): TreatmentPlan[] {
    return [...this.plans.values()].filter((p) => p.courseId === courseId);
  }

  updatePlan(id: EntityId, patch: Partial<Omit<TreatmentPlan, "id" | "createdAt">>): TreatmentPlan {
    const existing = this.plans.get(id);
    if (!existing) throw new Error(`PlanService: no plan with id "${id}"`);
    const updated: TreatmentPlan = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.plans.set(id, updated);
    return updated;
  }

  setDose(dose: Omit<Dose, "id">): Dose {
    const record: Dose = { ...dose, id: crypto.randomUUID() };
    this.doses.set(record.id, record);
    return record;
  }

  getDoseForPlan(planId: EntityId): Dose | undefined {
    return [...this.doses.values()].find((d) => d.planId === planId);
  }
}
