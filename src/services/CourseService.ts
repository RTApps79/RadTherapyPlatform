/**
 * RTApps RadTherapyPlatform — Course Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 */

import type { Course, Prescription, EntityId } from "@models/index";

export class CourseService {
  private courses = new Map<EntityId, Course>();
  private prescriptions = new Map<EntityId, Prescription>();

  createCourse(input: Omit<Course, "id" | "createdAt" | "updatedAt">): Course {
    const now = new Date().toISOString();
    const course: Course = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    this.courses.set(course.id, course);
    return course;
  }

  getCourse(id: EntityId): Course | undefined {
    return this.courses.get(id);
  }

  listCoursesForPatient(patientId: EntityId): Course[] {
    return [...this.courses.values()].filter((c) => c.patientId === patientId);
  }

  updateCourse(id: EntityId, patch: Partial<Omit<Course, "id" | "createdAt">>): Course {
    const existing = this.courses.get(id);
    if (!existing) throw new Error(`CourseService: no course with id "${id}"`);
    const updated: Course = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.courses.set(id, updated);
    return updated;
  }

  createPrescription(input: Omit<Prescription, "id" | "createdAt">): Prescription {
    const prescription: Prescription = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.prescriptions.set(prescription.id, prescription);
    this.updateCourse(input.courseId, { prescriptionId: prescription.id });
    return prescription;
  }

  getPrescription(id: EntityId): Prescription | undefined {
    return this.prescriptions.get(id);
  }
}
