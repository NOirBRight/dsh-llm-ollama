# Alpha.1 offline fixture graph

These archives are the repository-owned recursive install fixtures for the exact DeepSeek Harness alpha.1 dependency graph used by the publication gate. Official DSH archives were packed from the clean checkout recorded in [PROVENANCE.json](./PROVENANCE.json). Registry archives, including intentionally retained multiple versions, are recorded with their byte sizes and SHA-256 values. The fixtures are test inputs and are not shipped by dsh-llm-ollama.

The checker reads only these archives and their provenance. It does not discover package bytes from a checkout or an installed dependency tree. It serves every reachable child from these immutable bytes, disables lifecycle scripts with `--ignore-scripts`, and accepts only the four explicitly documented optional native `ws` peer gaps. Pack and verify children receive an allowlisted environment with isolated package-manager config, invalid offline registry, and isolated store; a negative probe rejects secret-like names, empty names, and Node loader settings.

To refresh official archives, run `pnpm pack` with the exact clean source package as its working directory. Inspect each resulting `package/package.json` and reject any `workspace:` dependency before recording the archive; never rewrite packed bytes. Recompute PROVENANCE.json and run `pnpm run pack:check`.
