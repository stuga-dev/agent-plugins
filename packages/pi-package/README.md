# @stuga/pi-package

Connect [Pi](https://pi.dev) to [Stuga](https://github.com/stuga-dev/stuga).

Stuga is a self-hosted collaborative workspace: real-time documents, structured databases with SQL, hybrid search, and first-class access for AI agents. An agent never writes silently: every edit is a **proposal** on a reviewable run ledger, attributed to the agent and accepted, rejected or reverted by a person. This package makes Pi a well-behaved Stuga agent.

It is a thin layer on [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter), which does the connection and the sign-in:

| Piece | What it does |
|---|---|
| Server registration | Registers the node's `/mcp` with pi-mcp-adapter as `stuga`, signed in with OAuth, or with an agent key when `STUGA_API_KEY` is set. |
| Prompt section | Explains how calls are routed and reviewed. With a key it ends with the key's workspace and its conventions. |
| Skills | `stuga-research`, `stuga-propose-edits`, `stuga-databases`, loaded on demand. |

The Stuga node enforces review, permissions and the run ledger. This package only shapes how the model works against them.

## Install

You need a running Stuga node and Pi (Node 22.19 or later).

```sh
pi install npm:pi-mcp-adapter
pi install npm:@stuga/pi-package
```

Tell it where the node is, in the shell that starts Pi:

```sh
export STUGA_URL=https://notes.example.com
```

or in `~/.pi/agent/settings.json`:

```json
{ "stuga": { "url": "https://notes.example.com" } }
```

The default is `http://127.0.0.1:8787`. A project's `.pi/settings.json` is never read for this, so a cloned repository cannot point Pi at another server.

### Sign in

Start Pi and run `/mcp-auth stuga`. Approve the request in the browser; the adapter keeps the token in your OS keychain and refreshes it. The session is yours: Pi can reach what you can reach, and its proposals are reviewed under your name.

### Or use an agent key

In Stuga, open **Settings → Your AI agents** and create an agent key. Narrow it to folders, make it read-only or give it an expiry as you see fit. Then:

```sh
export STUGA_API_KEY=vk_…
```

With a key there is no sign-in step, and the prompt section includes the key's workspace and its conventions.

## Use

Ask Pi about your documents, or to change them. It calls Stuga through the adapter's `mcp` tool (`mcp({ tool: "stuga_search", args: {...} })`). Edits come back as `Proposed`; open `<STUGA_URL>/review` to accept or reject them. Runs are badged `pi` in the review inbox.

## Remove

```sh
pi remove npm:@stuga/pi-package
```

Removing the package does not revoke access. In Stuga, revoke the connection or the key under **Settings → Your AI agents → Connected agents**.

## Limits

- Stuga's tools go through the adapter's `mcp` proxy tool, not one Pi tool each: the adapter registers servers added at runtime as proxy-only. To give the model direct tools, add your own `stuga` entry to `~/.pi/agent/mcp-adapter.json` with `"directTools": true`; that entry wins over this package's registration.
- With OAuth, the workspace's conventions are not in the prompt; the model reads them with `workspaces` action `instructions` before writing.
- Tested end to end against Pi 0.87.1 and pi-mcp-adapter 3.1.0, with OAuth sign-in and with an agent key.

## Development

Plain JavaScript with no runtime dependencies and no build step. It lives in [agent-plugins](https://github.com/stuga-dev/agent-plugins); the playbooks come from that repository's `skills/` and are copied into `playbooks/` on install, test and pack.

```sh
pnpm install
pnpm --filter @stuga/pi-package test
```

## License

MIT. Stuga itself is AGPL-3.0; this package is a client-side configuration layer and carries no Stuga code.
