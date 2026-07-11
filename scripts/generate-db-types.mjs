import { writeFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  NULLABLE_RPC_ARGUMENTS,
  markArgumentsNullable,
} from "./nullable-rpc-arguments.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRootPath = dirname(dirname(currentFilePath));
const targetPath = join(repoRootPath, "src/types/database.ts");
const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;

const result = spawnSync(
  "npx",
  ["supabase", "gen", "types", "typescript", "--local"],
  {
    cwd: repoRootPath,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  },
);

if (result.status !== 0) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? 1);
}

if (!result.stdout || result.stdout.trim().length === 0) {
  process.stderr.write("Supabase type generation returned empty output.\n");
  process.exit(1);
}

let patchedOutput = result.stdout;
for (const [functionName, argumentNames] of Object.entries(
  NULLABLE_RPC_ARGUMENTS,
)) {
  patchedOutput = markArgumentsNullable(
    patchedOutput,
    functionName,
    argumentNames,
  );
}

// The CLI emits a trailing blank line; normalize to a single trailing
// newline so re-running this script is idempotent against the committed
// file (and matches this repo's usual file-ending convention).
patchedOutput = patchedOutput.replace(/\n+$/, "\n");

try {
  await writeFile(temporaryPath, patchedOutput, "utf8");
  await rename(temporaryPath, targetPath);
} catch (error) {
  await rm(temporaryPath, { force: true });
  throw error;
}
