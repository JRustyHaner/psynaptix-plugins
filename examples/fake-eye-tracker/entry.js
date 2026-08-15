/**
 * fake-eye-tracker — example signal-provider plugin (issue #458 devkit).
 *
 * This file runs INSIDE a Web Worker (issue #456): there is no DOM, no
 * localStorage/sessionStorage/indexedDB, no document.cookie, and no access
 * to other windows. The factory receives the NARROW context — emitSample,
 * log, and this plugin's own config. Signal samples leave the worker only
 * via emitSample(); the host relays them to the licensed ingest pipeline.
 *
 * Sanitizer-clean (issue #457): no eval/new Function, no fetch/XHR/
 * WebSocket, no DOM sinks, no storage/cookie, no postMessage, no dynamic
 * import/require, no atob/btoa/fromCharCode.
 */

/** The narrow context handed to every plugin factory. */
export default function factory(context) {
  let active = false;
  let lastEventAt = null;

  return {
    id: 'fake-eye-tracker',
    signalType: 'eye-tracking',

    async init() {
      active = true;
      context.log(0, 'fake-eye-tracker initialized');
    },

    async onSessionStart(session) {
      lastEventAt = Date.now();
      context.log(0, 'session started: ' + String(session.sessionId ?? 'unknown'));
    },

    async onTrialStart(trial) {
      lastEventAt = Date.now();
      // Emit synthetic samples for this trial — the ONLY egress surface.
      for (let i = 0; i < 5; i++) {
        context.emitSample({
          kind: 'eye-sample',
          trialId: trial.trialId,
          gazeX: 0.5 + i * 0.01,
          gazeY: 0.5 - i * 0.01,
          timestampMs: Date.now(),
        });
      }
    },

    async onEvent() { lastEventAt = Date.now(); },
    async onTrialEnd() { lastEventAt = Date.now(); },
    async onSessionEnd() { active = false; },

    getStatus() {
      return { id: this.id, active, connected: false, lastEventAt, error: null };
    },

    async destroy() { active = false; },

    getCalibrationSteps() {
      return [{ id: 'eye-fake-check', label: 'Fake eye-tracker check', providerId: this.id, status: 'pending', startedAt: null, finishedAt: null }];
    },

    getCalibrationSettings() {
      return { synthetic: true, samplesPerTrial: 5 };
    },
  };
}
