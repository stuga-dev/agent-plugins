/**
 * Stuga's MCP tools and their action enums, verbatim from stuga's
 * packages/agent-surface/src/catalog.ts (MCP_CONTRACT_VERSION 2).
 * Every package's tests check the tool and action names it hands a model against this.
 */
export const CONTRACT_TOOLS = {
  workspaces: ["list", "instructions"],
  docs: ["list", "metadata"],
  search: [],
  markdown: ["read", "status", "provenance"],
  comments: [],
  folders: [],
  events: [],
  collections: ["list", "open"],
  retrieve: [],
  databases: ["list", "schema", "status", "page"],
  query: [],
  docs_create: [],
  markdown_append: [],
  markdown_edit: ["write", "str_replace", "cited_edits"],
  comments_add: [],
  media_upload: ["upload", "upload_from_url"],
  collections_edit: ["create", "rename", "delete", "add_items", "remove_items"],
  databases_add: ["create_database", "create_table", "add_column", "insert_rows", "import", "start_import", "create_view", "open_page"],
  databases_change: ["update_rows", "delete_rows", "update_view"],
};
export const CONTRACT_ACTIONS = new Set(Object.values(CONTRACT_TOOLS).flat());

/** Every tool named with its `mcp__<server>__` prefix, and every action named as `action: "x"` or `action "x"`. */
export function namedToolsAndActions(text) {
  const tools = [...text.matchAll(/mcp__(?:\{\{SERVER\}\}|stuga)__(\w+)/g)].map((m) => m[1]);
  const actions = [...text.matchAll(/action:? "(\w+)"/g)].map((m) => m[1]);
  return { tools, actions };
}
