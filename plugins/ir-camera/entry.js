/**
 * ir-camera — IR bright-pupil gaze plugin (psynaptix issue #470).
 *
 * Runs INSIDE a Web Worker (#456): no DOM, no storage, no network. The
 * collector's NATIVE main process captures the V4L2 GREY IR stream and
 * relays each frame into this plugin via the host's external-sample channel
 * (`onExternalSample`). This plugin is pure processing:
 *
 *   GREY frame (640x360) -> bright-pupil threshold -> pupil centroid+size
 *     -> gaze estimate -> DERIVED sample via emitSample()
 *
 * Privacy contract (issue #470): raw frames are never written to disk, never
 * sent over the bridge, and never emitted — only derived metrics leave the
 * plugin. Sanitizer-clean (#457): no eval, no fetch/XHR/WebSocket, no DOM,
 * no storage, no postMessage, no dynamic import, no atob/fromCharCode.
 */

export default function factory(context) {
  let active = false;
  let lastEventAt = null;
  let lastFrame = null; // { w, h, pupilX, pupilY, pupilSize } — derived only

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /**
   * Bright-pupil detection on a GREY frame (issue #470).
   * frame = { w, h, grey: number[] } (row-major 8-bit luminance).
   * Brightest region above a high threshold = the pupil (IR bright-pupil).
   * Returns { pupilX, pupilY, pupilSize, facePresent } — never the frame.
   */
  function brightPupil(frame) {
    const w = Number(frame.w) || 0;
    const h = Number(frame.h) || 0;
    const grey = frame.grey;
    if (!w || !h || !Array.isArray(grey) || grey.length < w * h) {
      return { pupilX: null, pupilY: null, pupilSize: 0, facePresent: false };
    }
    // Threshold: bright-pupil glints sit well above the IR illumination floor.
    let sum = 0;
    for (let i = 0; i < grey.length; i++) sum += grey[i];
    const mean = sum / grey.length;
    const threshold = mean + (255 - mean) * 0.55;
    let px = 0, py = 0, count = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grey[y * w + x] >= threshold) {
          px += x; py += y; count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (count < 16) return { pupilX: null, pupilY: null, pupilSize: 0, facePresent: false };
    const pupilX = clamp(px / count / Math.max(1, w), 0, 1);
    const pupilY = clamp(py / count / Math.max(1, h), 0, 1);
    const pupilSize = Math.max(maxX - minX, maxY - minY) / Math.max(w, h);
    return { pupilX, pupilY, pupilSize, facePresent: true };
  }

  /** Coarse gaze: normalized pupil position -> quadrant (derived only). */
  function quadrant(pupilX, pupilY) {
    if (pupilX === null || pupilY === null) return 'none';
    const hz = pupilX < 0.5 ? 'left' : 'right';
    const vt = pupilY < 0.5 ? 'top' : 'bottom';
    return hz + '-' + vt;
  }

  // The collector's native layer relays each IR frame here (issue #470).
  context.onExternalSample((sample) => {
    if (!active) return;
    lastEventAt = Date.now();
    if (sample && sample.kind === 'ir-frame') {
      const derived = brightPupil(sample);
      lastFrame = { ...derived, w: Number(sample.w) || 0, h: Number(sample.h) || 0 };
      context.emitSample({
        kind: 'gaze',
        pupilX: derived.pupilX,
        pupilY: derived.pupilY,
        pupilSize: derived.pupilSize,
        gazeQuadrant: quadrant(derived.pupilX, derived.pupilY),
        facePresent: derived.facePresent,
        timestampMs: Date.now(),
      });
    }
  });

  return {
    id: 'ir-camera',
    signalType: 'eye-tracking',

    async init() {
      active = true;
      context.log(0, 'ir-camera ready — awaiting host-relayed IR frames');
    },

    async onSessionStart(session) {
      lastEventAt = Date.now();
      context.log(0, 'session started: ' + String(session.sessionId ?? 'unknown'));
    },

    async onTrialStart() { lastEventAt = Date.now(); },
    async onEvent() { lastEventAt = Date.now(); },
    async onTrialEnd() { lastEventAt = Date.now(); },
    async onSessionEnd() { active = false; },

    getStatus() {
      return { id: this.id, active, connected: false, lastEventAt, error: null };
    },

    async destroy() { active = false; },

    getCalibrationSteps() {
      return [{ id: 'ir-gaze-cal', label: 'IR gaze calibration', providerId: this.id, status: 'pending', startedAt: null, finishedAt: null }];
    },

    getCalibrationSettings() {
      return { modality: 'ir-bright-pupil', derivedOnly: true, frameRate: 30, thresholdMode: 'adaptive' };
    },
  };
}
