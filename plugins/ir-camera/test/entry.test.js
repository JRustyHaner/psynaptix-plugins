/**
 * ir-camera — devkit-style tests (issue #470). Zero-dep: node:test + assert.
 * Covers the acceptance points: bright-pupil detection on a synthetic GREY
 * fixture, derived-only emission (no raw frames), and the plugin contract.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import factory from '../entry.js';

const W = 64, H = 36;

/** Build a GREY frame: dark field + a bright pupil blob at (cx, cy). */
function greyFrame(cx, cy, radius = 3, w = W, h = H) {
  const grey = new Array(w * h).fill(30);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) grey[y * w + x] = 250;
    }
  }
  return { kind: 'ir-frame', w, h, grey };
}

const samples = [];
const context = {
  emitSample: (s) => samples.push(s),
  log: () => {},
  config: {},
  onExternalSample: (cb) => { externalCb = cb; },
};
let externalCb = null;

describe('ir-camera plugin (issue #470)', () => {
  it('factory returns the provider contract (id/signalType/lifecycle)', async () => {
    const p = await factory(context);
    assert.equal(p.id, 'ir-camera');
    assert.equal(p.signalType, 'eye-tracking');
    for (const m of ['init', 'onSessionStart', 'onTrialStart', 'onEvent', 'onTrialEnd', 'onSessionEnd', 'destroy']) {
      assert.equal(typeof p[m], 'function', m + ' must be a function');
    }
    assert.equal(p.getCalibrationSettings().derivedOnly, true);
  });

  it('detects the bright pupil center on a synthetic IR frame (acceptance)', async () => {
    const p = await factory(context);
    await p.init();
    samples.length = 0;
    externalCb(greyFrame(32, 18)); // center
    assert.equal(samples.length, 1);
    const s = samples[0];
    assert.equal(s.kind, 'gaze');
    assert.ok(Math.abs(s.pupilX - 0.5) < 0.06, 'pupilX ~ center');
    assert.ok(Math.abs(s.pupilY - 0.5) < 0.1, 'pupilY ~ center');
    assert.ok(s.pupilSize > 0 && s.pupilSize < 0.5, 'sane pupil size');
    assert.equal(s.facePresent, true);
  });

  it('emits DERIVED metrics only — no raw frame ever leaves the plugin (acceptance)', async () => {
    const p = await factory(context);
    await p.init();
    samples.length = 0;
    externalCb(greyFrame(32, 18));
    for (const s of samples) {
      assert.equal(s.kind, 'gaze');
      assert.equal(s.grey, undefined, 'no raw pixels in emitted samples');
      assert.equal(s.w, undefined, 'no frame width in emitted samples');
      assert.ok('pupilX' in s && 'pupilY' in s && 'gazeQuadrant' in s, 'derived fields only');
    }
  });

  it('maps the pupil to a gaze quadrant', async () => {
    const p = await factory(context);
    await p.init();
    samples.length = 0;
    externalCb(greyFrame(8, 9)); // upper-left
    assert.equal(samples[0].gazeQuadrant, 'left-top');
    samples.length = 0;
    externalCb(greyFrame(56, 27)); // lower-right
    assert.equal(samples[0].gazeQuadrant, 'right-bottom');
  });

  it('reports no face when the frame is dark (no bright pupil)', async () => {
    const p = await factory(context);
    await p.init();
    samples.length = 0;
    externalCb({ kind: 'ir-frame', w: W, h: H, grey: new Array(W * H).fill(30) });
    assert.equal(samples.length, 1);
    assert.equal(samples[0].facePresent, false);
    assert.equal(samples[0].gazeQuadrant, 'none');
  });

  it('tolerates malformed frames without throwing', async () => {
    const p = await factory(context);
    await p.init();
    samples.length = 0;
    assert.doesNotThrow(() => externalCb({ kind: 'ir-frame', w: 0, h: 0, grey: null }));
    assert.doesNotThrow(() => externalCb({ kind: 'not-a-frame' }));
  });
});
