/**
 * fake-eye-tracker — devkit reference tests (issue #458).
 *
 * Zero-dependency: uses node:test + node:assert, so `npm test` runs with
 * no install step — the same command the approval pipeline (#457) executes
 * against the pinned SHA.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import factory from '../entry.js';

const context = {
  emitSample: (sample) => { samples.push(sample); },
  log: () => {},
  config: {},
};
const samples = [];

describe('fake-eye-tracker plugin contract (issue #458)', () => {
  it('factory returns a provider whose id matches the manifest', async () => {
    const provider = await factory(context);
    assert.equal(provider.id, 'fake-eye-tracker');
    assert.equal(provider.signalType, 'eye-tracking');
  });

  it('provider implements the full SignalProvider lifecycle', async () => {
    const provider = await factory(context);
    for (const method of ['init', 'onSessionStart', 'onTrialStart', 'onEvent', 'onTrialEnd', 'onSessionEnd', 'destroy']) {
      assert.equal(typeof provider[method], 'function', `${method} must be a function`);
    }
    await provider.init();
    assert.equal(provider.getStatus().active, true);
  });

  it('emits synthetic samples only through the narrow emitSample context', async () => {
    const provider = await factory(context);
    await provider.onTrialStart({ trialId: 't-1' });
    assert.equal(samples.length, 5);
    assert.equal(samples[0].kind, 'eye-sample');
    assert.equal(samples[0].trialId, 't-1');
    assert.ok(typeof samples[0].gazeX === 'number');
  });

  it('exposes calibration steps + settings (issue #224 contract)', async () => {
    const provider = await factory(context);
    const steps = provider.getCalibrationSteps();
    assert.equal(steps.length, 1);
    assert.equal(steps[0].providerId, 'fake-eye-tracker');
    assert.deepEqual(provider.getCalibrationSettings(), { synthetic: true, samplesPerTrial: 5 });
  });
});
