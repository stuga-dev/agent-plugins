# Stuga agent plugins

Packages that connect coding agents to [Stuga](https://github.com/stuga-dev/stuga), each in the form its host installs.

| Package | Host | Install |
|---|---|---|
| [`@stuga/dsh-plugin`](packages/dsh-plugin) | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | `dsh plugin --profile web add @stuga/dsh-plugin` |
| [`@stuga/pi-package`](packages/pi-package) | [Pi](https://pi.dev) | `pi install npm:pi-mcp-adapter && pi install npm:@stuga/pi-package` |

Claude, Codex and Antigravity need no package: Stuga's **Settings → Your AI agents** sets them up, and the Claude plugin ships from [stuga-plugin](https://github.com/stuga-dev/stuga-plugin).

Each package is a thin layer. The Stuga node enforces everything: review, permissions, the run ledger. A package only connects the host and shapes the model's behaviour against that surface.

## Layout

- `packages/<name>/` — one npm package per host.
- `skills/` — the playbooks (`stuga-research`, `stuga-propose-edits`, `stuga-databases`) shared by every package. `scripts/sync-skills.mjs` copies them to the path each package names in `stuga.skills` on install, test and pack; edit them here, never in a package.
- `test/mcp-contract.mjs` — Stuga's MCP tool and action names, which every package's tests check its prompt text against.

## Development

```sh
pnpm install
pnpm test
```

## Releasing

Bump `version` in the package's `package.json`, merge, then push an annotated tag `<package>-v<version>`:

```sh
git tag -a dsh-plugin-v0.2.1 -m "dsh-plugin 0.2.1"
git push origin dsh-plugin-v0.2.1
```

The `publish` workflow runs the tests and, once approved, publishes that package to npm with provenance. Tags are immutable once pushed.

A new package's first version is published by hand, since npm trusts a workflow only for a package that already exists: `npm publish` in its directory, then `npm trust github <name> --file publish.yml --repo stuga-dev/agent-plugins --env publish --allow-publish` and `npm access set mfa=publish <name>`. Its tag then only records the release; the workflow sees the version on npm and skips publishing.

## License

MIT. Stuga itself is AGPL-3.0; these packages are client-side configuration and carry no Stuga code.
