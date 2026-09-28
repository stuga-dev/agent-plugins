// Copy the shared playbooks in skills/ into every package that ships them,
// at the path its package.json names in `stuga.skills`.
// With no argument it syncs every package (`pnpm install`); a package's own
// pretest and prepack pass `.` to sync only itself, so parallel runs never race.
import { cp, readFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(ROOT, "skills");

const packages = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : (await readdir(path.join(ROOT, "packages"))).map((dir) => path.join(ROOT, "packages", dir));

for (const pkg of packages) {
  const dir = path.basename(pkg);
  const manifest = JSON.parse(await readFile(path.join(pkg, "package.json"), "utf8"));
  const into = manifest.stuga?.skills;
  if (typeof into !== "string") continue;
  const target = path.resolve(pkg, into);
  if (!target.startsWith(pkg + path.sep)) throw new Error(`${dir}: stuga.skills must stay inside the package`);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}
