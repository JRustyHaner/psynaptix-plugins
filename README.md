# Psynaptix Plugins — canonical plugin tree

Fork this repository to author a Psynaptix signal-provider plugin. The approval gate (#484) only accepts plugins from **public forks of this repo**, gated by the canonical workflow + a sigstore attestation.

## Authoring

1. Fork this repo (keep it **public**).
2. Copy `examples/fake-eye-tracker/` to `plugins/<your-plugin>/`.
3. Implement your provider (see the [devkit](../../../psynaptix/blob/main/docs/plugin-devkit.md)).
4. Push; the `plugin-gate.yml` workflow runs `npm test` + the sanitizer on every commit.
5. Submit the SHA-pinned raw URL via the portal — the service verifies the gate + attestation.

The workflow file is the canonical gate — the service verifies its hash at the pinned SHA, so do not modify it.

