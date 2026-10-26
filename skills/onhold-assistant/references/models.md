# Compatible model replacement

Translation replacement accepts llama.cpp-compatible GGUF files. Decision replacement accepts Laya checkpoints with the same typed scoring API and required tokenizer/config layout. It is not a universal adapter for arbitrary model formats.

```sh
node <skill-directory>/scripts/setup.mjs replace-model --translation <local.gguf> --sha256 <verified-sha256> --no-open
node <skill-directory>/scripts/setup.mjs replace-model --decision <local-laya-directory> --manifest <verified-manifest.json> --no-open
node <skill-directory>/scripts/setup.mjs replace-model --translation default --decision default --no-open
```

Obtain checksums from the model's official release or from local files the user already trusts. Do not calculate a checksum of an untrusted download and describe that as proof of its origin. Never disable model verification. Custom translation models still use the translation prompt; validate a real translation after replacement.

A decision manifest is JSON with `name` and `files`. Each file has `name` (relative to the model directory), integer `size`, and hexadecimal SHA-256. All required files listed in the bundled installer's `lib/runtime-lock.json` must be present; absolute/escaping paths and duplicate file names are rejected. For an authorized offline setup, use `--model`, `--runtime`, `--decision-model`, `--decision-manifest` and `--decision-python` to reuse local resources.

Replacement backs up the current configuration/code/database, keeps the old weights, restarts owned services and checks readiness. If startup fails, rollback restores the old configuration. It does not delete old SQLite records; the new model fingerprint uses a separate namespace. Never promise translation quality solely from readiness.
