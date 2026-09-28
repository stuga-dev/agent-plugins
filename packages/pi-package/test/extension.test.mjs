import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import stuga, * as ext from "../extensions/stuga.js";
import { CONTRACT_ACTIONS, CONTRACT_TOOLS, namedToolsAndActions } from "../../../test/mcp-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = "http://127.0.0.1:8787";

/** A stand-in for the adapter's listener on the runtime-register event. */
function fakeAdapter({ fail } = {}) {
  const registered = [];
  const emit = (channel, request) => {
    if (channel !== ext.REGISTER_EVENT) return;
    if (fail) {
      request.result = { ok: false, error: new Error(fail) };
      return;
    }
    const entry = { name: request.name, definition: request.definition, disposed: false };
    registered.push(entry);
    request.result = { ok: true, registration: { dispose: async () => void (entry.disposed = true) } };
  };
  return { emit, registered };
}

/** A stand-in for Pi's ExtensionAPI: collects handlers so a test can fire events. */
function fakePi(emit = () => {}) {
  const handlers = {};
  const notes = [];
  return {
    notes,
    events: { emit },
    on: (event, handler) => void (handlers[event] = handler),
    fire: (event, payload = {}) => handlers[event]({ type: event, ...payload }, { ui: { notify: (text, level) => notes.push({ text, level }) } }),
  };
}

/** Run `body` with the given environment variables, restoring them afterwards. */
async function withEnv(vars, body) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await body();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("the node's address comes from STUGA_URL, then Pi's global settings, then the default", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "stuga-pi-"));
  assert.deepEqual(ext.resolveSettings({}, dir), { url: URL, apiKey: undefined });

  await writeFile(path.join(dir, "settings.json"), JSON.stringify({ stuga: { url: "https://notes.example.com/" } }));
  assert.equal(ext.resolveSettings({}, dir).url, "https://notes.example.com");
  assert.equal(ext.resolveSettings({ STUGA_URL: "http://10.0.0.5:8787" }, dir).url, "http://10.0.0.5:8787");
  assert.equal(ext.resolveSettings({ STUGA_API_KEY: " vk_abc " }, dir).apiKey, "vk_abc");
  assert.throws(() => ext.resolveSettings({ STUGA_URL: "notes.example.com" }, dir), /absolute http\(s\) origin/);
});

test("a project's .pi/settings.json cannot point the key at another server", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "stuga-pi-project-"));
  const agent = await mkdtemp(path.join(tmpdir(), "stuga-pi-agent-"));
  await mkdir(path.join(project, ".pi"));
  await writeFile(path.join(project, ".pi", "settings.json"), JSON.stringify({ stuga: { url: "https://evil.example" } }));
  const cwd = process.cwd();
  process.chdir(project);
  try {
    assert.equal(ext.resolveSettings({}, agent).url, URL);
  } finally {
    process.chdir(cwd);
  }
});

test("a key signs in with bearer auth, no key with OAuth, and both label the client", () => {
  const key = ext.serverDefinition({ url: URL, apiKey: "vk_abc" });
  assert.deepEqual(key, {
    url: `${URL}/mcp`,
    httpTransport: "streamable-http",
    headers: { "x-stuga-client": "pi" },
    auth: "bearer",
    bearerTokenEnv: "STUGA_API_KEY",
  });
  assert.doesNotMatch(JSON.stringify(key), /vk_abc/, "the key stays in the environment, never in the definition");

  const oauth = ext.serverDefinition({ url: URL });
  assert.equal(oauth.auth, "oauth");
  assert.deepEqual(oauth.oauth, { clientName: "Pi" });
  assert.equal(oauth.headers["x-stuga-client"], "pi");
});

test("registerServer tells a missing adapter apart from a refused registration", () => {
  assert.deepEqual(ext.registerServer(() => {}, {}), { missing: true });
  assert.match(ext.registerServer(fakeAdapter({ fail: 'MCP server "stuga" is already registered' }).emit, {}).error.message, /already registered/);
  const adapter = fakeAdapter();
  assert.ok(ext.registerServer(adapter.emit, { url: "x" }).registration);
  assert.equal(adapter.registered[0].name, "stuga");
});

test("session_start registers the node once and session_shutdown disposes it", async () => {
  await withEnv({ STUGA_URL: URL, STUGA_API_KEY: undefined }, async () => {
    const adapter = fakeAdapter();
    const pi = fakePi(adapter.emit);
    stuga(pi);
    await pi.fire("session_start", { reason: "startup" });
    await pi.fire("session_start", { reason: "reload" });
    assert.equal(adapter.registered.length, 1);
    assert.equal(adapter.registered[0].definition.auth, "oauth");
    assert.deepEqual(pi.notes, []);
    await pi.fire("session_shutdown");
    assert.equal(adapter.registered[0].disposed, true);
  });
});

test("without pi-mcp-adapter the user is told how to install it", async () => {
  await withEnv({ STUGA_URL: URL }, async () => {
    const pi = fakePi();
    stuga(pi);
    await pi.fire("session_start", { reason: "startup" });
    assert.equal(pi.notes.length, 1);
    assert.match(pi.notes[0].text, /pi install npm:pi-mcp-adapter/);
    assert.equal(pi.notes[0].level, "error");
  });
});

test("a stuga server the user configured wins quietly", async () => {
  await withEnv({ STUGA_URL: URL }, async () => {
    const pi = fakePi(fakeAdapter({ fail: 'MCP server "stuga" is already registered' }).emit);
    stuga(pi);
    await pi.fire("session_start", { reason: "startup" });
    assert.deepEqual(pi.notes, []);
  });
});

test("a malformed STUGA_URL is reported and nothing is registered", async () => {
  await withEnv({ STUGA_URL: "notes.example.com" }, async () => {
    const adapter = fakeAdapter();
    const pi = fakePi(adapter.emit);
    stuga(pi);
    await pi.fire("session_start", { reason: "startup" });
    assert.equal(adapter.registered.length, 0);
    assert.match(pi.notes[0].text, /STUGA_URL must be/);
    const event = { systemPromptOptions: { sections: {} } };
    await pi.fire("before_agent_start", event);
    assert.deepEqual(event.systemPromptOptions.sections, {});
  });
});

test("before_agent_start adds the section, ending with the key's workspace", async () => {
  const fetchImpl = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, `${URL}/api/instructions`);
    assert.equal(init.headers.authorization, "Bearer vk_abc");
    assert.equal(init.headers["x-stuga-client"], "pi");
    return Response.json({ workspace_id: "ws_1", name: "Notes", instructions: "File meeting notes under /Meetings." });
  };
  try {
    await withEnv({ STUGA_URL: URL, STUGA_API_KEY: "vk_abc" }, async () => {
      const pi = fakePi(fakeAdapter().emit);
      stuga(pi);
      await pi.fire("session_start", { reason: "startup" });
      const event = { systemPromptOptions: { sections: {} } };
      await pi.fire("before_agent_start", event);
      const section = event.systemPromptOptions.sections[ext.SECTION_TAG];
      assert.match(section, /mcp\(\{ tool: "stuga_search"/);
      assert.match(section, /\/mcp-auth stuga/);
      assert.match(section, /`workspace_id` `ws_1`/);
      assert.match(section, /File meeting notes under \/Meetings\./);
      assert.match(section, new RegExp(`${URL}/review`));
    });
  } finally {
    globalThis.fetch = fetchImpl;
  }
});

test("with OAuth the section carries no workspace and never calls the node", async () => {
  const fetchImpl = globalThis.fetch;
  globalThis.fetch = async () => assert.fail("no key, so no fetch");
  try {
    await withEnv({ STUGA_URL: URL, STUGA_API_KEY: undefined }, async () => {
      const pi = fakePi(fakeAdapter().emit);
      stuga(pi);
      await pi.fire("session_start", { reason: "startup" });
      const event = { systemPromptOptions: { sections: {} } };
      await pi.fire("before_agent_start", event);
      assert.doesNotMatch(event.systemPromptOptions.sections[ext.SECTION_TAG], /The key's workspace/);
    });
  } finally {
    globalThis.fetch = fetchImpl;
  }
});

test("an unreachable node leaves the section usable", async () => {
  assert.equal(await ext.fetchWorkspace(URL, "vk_abc", async () => new Response("", { status: 401 })), null);
  assert.equal(await ext.fetchWorkspace(URL, "vk_abc", async () => { throw new Error("ECONNREFUSED"); }), null);
});

test("the playbooks render with the node's address as valid Pi skills", async () => {
  const into = await mkdtemp(path.join(tmpdir(), "stuga-pi-render-"));
  const dirs = await ext.renderPlaybooks("https://notes.example.com", { source: path.join(ROOT, "playbooks"), into });
  assert.deepEqual(dirs.map((d) => path.basename(d)), ["stuga-databases", "stuga-propose-edits", "stuga-research"]);
  for (const dir of dirs) {
    const text = await readFile(path.join(dir, "SKILL.md"), "utf8");
    assert.doesNotMatch(text, /\{\{/, `${dir} keeps a placeholder`);
    assert.match(text, /https:\/\/notes\.example\.com/);
    // Pi loads a skill only when its frontmatter names it after its directory and describes it in ≤1024 characters.
    const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
    assert.equal(/^name: (.+)$/m.exec(front)?.[1], path.basename(dir));
    const description = /^description: (.+)$/m.exec(front)?.[1] ?? "";
    assert.ok(description.length > 0 && description.length <= 1024, `${dir} description length ${description.length}`);
  }
});

test("the section names only the tools and actions Stuga ships", () => {
  const text = ext.sectionText({ url: URL });
  const { actions } = namedToolsAndActions(text);
  for (const action of actions) assert.ok(CONTRACT_ACTIONS.has(action), `section names unknown action ${action}`);
  // The Pi section writes tools bare (`search`), as the adapter's wrapper takes them.
  const tools = [...text.matchAll(/`(\w+)`( action|,| and| for| over| \(| with| take)/g)].map((m) => m[1]);
  assert.ok(tools.length > 5);
  for (const tool of tools) assert.ok(tool in CONTRACT_TOOLS || tool === "workspace_ids" || tool === "unavailable", `section names unknown tool ${tool}`);
});

test("package.json declares the extension for Pi and is listed in the gallery", async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.name, "@stuga/pi-package");
  assert.ok(pkg.keywords.includes("pi-package"), "the pi-package keyword lists it on pi.dev/packages");
  assert.deepEqual(pkg.pi.extensions, ["./extensions/stuga.js"]);
  assert.equal(pkg.dependencies, undefined, "the package ships with no runtime dependencies");
  assert.ok(pkg.files.includes("playbooks/"));
});
