/**
 * RTApps RadTherapyPlatform — Legacy Bridge Protocol
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * A minimal, opt-in postMessage contract between the platform shell and a
 * legacy app running inside an iframe (see LegacyIframeModule.ts).
 *
 * This is NOT required for a legacy app to be wrapped and displayed — the
 * initial Phase 2 wrap works with zero changes to the legacy code. This
 * bridge exists for the follow-up increment where you want, e.g., the OIS
 * iframe to be told which patient was selected in the Patient Library
 * module, or for a legacy app to notify the platform that a case was
 * saved. Add a small `<script>` to the legacy page, listening/posting
 * against this same message shape, when you're ready to wire that up —
 * nothing here forces that work to happen before the app is usable.
 */

export const LEGACY_BRIDGE_NAMESPACE = "rtapps-legacy-bridge" as const;

/** Messages the platform shell may send INTO a legacy iframe. */
export interface LegacyBridgeInbound {
  namespace: typeof LEGACY_BRIDGE_NAMESPACE;
  type: "patient:selected" | "dataset:opened" | "theme:sync";
  payload: unknown;
}

/** Messages a legacy iframe may send OUT to the platform shell. */
export interface LegacyBridgeOutbound {
  namespace: typeof LEGACY_BRIDGE_NAMESPACE;
  type: "ready" | "patient:changed" | "case:saved" | "navigate-request";
  payload: unknown;
}

export function isLegacyBridgeOutbound(data: unknown): data is LegacyBridgeOutbound {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).namespace === LEGACY_BRIDGE_NAMESPACE
  );
}

/** Send a message into a mounted legacy iframe. Safe to call before the iframe signals "ready" — the browser queues nothing, so callers should wait for a "ready" outbound message first if delivery matters. */
export function postToLegacyFrame(
  iframe: HTMLIFrameElement,
  type: LegacyBridgeInbound["type"],
  payload: unknown,
  targetOrigin: string = window.location.origin,
): void {
  iframe.contentWindow?.postMessage(
    { namespace: LEGACY_BRIDGE_NAMESPACE, type, payload } satisfies LegacyBridgeInbound,
    targetOrigin,
  );
}
