/**
 * RTApps RadTherapyPlatform — Branding & Ownership
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Single source of truth for product naming, copyright, and the
 * non-clinical-use disclaimer. Every module, exported report, and
 * generated document must pull these values from here rather than
 * hardcoding strings locally, so a future rebrand or legal-text update
 * only happens in one place.
 */

export const branding = {
  productShortName: "RTApps",
  productFullName: "RTApps RadTherapyPlatform",
  tagline: "The Ultimate Radiation Therapy Education & Simulation Platform",
  copyrightHolder: "Kevin Kindle",
  copyrightYear: 2026,
  get copyrightLine(): string {
    return `Copyright (c) ${this.copyrightYear} ${this.copyrightHolder}. All Rights Reserved.`;
  },
  nonClinicalDisclaimer: "Educational simulation — not for clinical use.",
} as const;

/**
 * Standard footer block for generated/exported documents (plan printouts,
 * QA reports, education certificates, case manifests, etc). Keep this in
 * sync with `branding` above — it intentionally re-derives from it rather
 * than duplicating strings.
 */
export function documentFooterText(): string {
  return `${branding.productFullName} — ${branding.copyrightLine} — ${branding.nonClinicalDisclaimer}`;
}
