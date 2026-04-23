import { writeFile, rename, rm, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertNoUnknownLicenses,
  createLicenseInventory,
} from "./license-inventory.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRootPath = dirname(dirname(currentFilePath));
const targetPath = join(repoRootPath, "src/generated/licenses.json");
const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
const rawReportPath = join(repoRootPath, `.pnpm-licenses.${randomUUID()}.json`);

// `pnpm licenses` の JSON は環境によって stdout で安定して取れないため、
// いったん一時ファイルへ出してから読む。
const result = spawnSync(
  "/bin/bash",
  ["-lc", `pnpm licenses list --json --prod > "${rawReportPath}"`],
  {
  cwd: repoRootPath,
  encoding: "utf8",
  stdio: ["inherit", "inherit", "pipe"],
},
);

if (result.status !== 0) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? 1);
}

let report;

try {
  const rawReport = await readFile(rawReportPath, "utf8");

  if (rawReport.trim().length === 0) {
    process.stderr.write("License generation returned empty output.\n");
    process.exit(1);
  }

  report = JSON.parse(rawReport);
} catch (error) {
  process.stderr.write("Failed to parse pnpm license output.\n");
  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  }
  process.exit(1);
}

const inventory = await createLicenseInventory(report);

// CI では unknown / unsupported license をここで fail させる。
// licenseText が見つからない package は UI 上の manualReviewRequired で扱う。
assertNoUnknownLicenses(inventory);

try {
  await mkdir(dirname(targetPath), { recursive: true });
  // commit 管理する generated file なので、atomic write で中途半端な状態を避ける。
  await writeFile(`${temporaryPath}`, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  await rename(temporaryPath, targetPath);
} catch (error) {
  await rm(temporaryPath, { force: true });
  throw error;
} finally {
  await rm(rawReportPath, { force: true });
}
