import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const LICENSE_FILE_CANDIDATES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "license",
  "license.md",
  "license.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "COPYING.txt",
];

const NOTICE_FILE_CANDIDATES = [
  "NOTICE",
  "NOTICE.md",
  "NOTICE.txt",
  "notice",
  "notice.md",
  "notice.txt",
];

function normalizeString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeVersions(versions) {
  return [...new Set(versions)].sort((left, right) => left.localeCompare(right));
}

function createPackageId(name, versions) {
  return `${name}@${versions.join("+")}`;
}

function isUnsupportedLicense(license) {
  const normalizedLicense = license.trim().toUpperCase();

  return (
    normalizedLicense.length === 0 ||
    normalizedLicense === "UNKNOWN" ||
    normalizedLicense === "UNLICENSED" ||
    normalizedLicense.startsWith("SEE LICENSE IN")
  );
}

async function readFirstMatchingFile(packagePaths, candidateNames, readTextFile) {
  for (const packagePath of packagePaths) {
    for (const candidateName of candidateNames) {
      const candidatePath = join(packagePath, candidateName);

      try {
        const text = await readTextFile(candidatePath, "utf8");
        const normalizedText = text.trim();

        if (normalizedText.length > 0) {
          return {
            text: normalizedText,
            source: basename(candidatePath),
          };
        }
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          (error.code !== "ENOENT" && error.code !== "ENOTDIR")
        ) {
          throw error;
        }
      }
    }
  }

  return {
    text: null,
    source: null,
  };
}

function createLicenseSummary(packages) {
  const countByLicense = new Map();

  for (const pkg of packages) {
    countByLicense.set(pkg.license, (countByLicense.get(pkg.license) ?? 0) + 1);
  }

  return [...countByLicense.entries()]
    .map(([license, count]) => ({ license, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.license.localeCompare(right.license),
    );
}

export async function createLicenseInventory(
  report,
  {
    generatedAt = new Date().toISOString(),
    readTextFile = readFile,
  } = {},
) {
  const packages = [];

  for (const entries of Object.values(report)) {
    for (const entry of entries) {
      const versions = normalizeVersions(entry.versions);
      const normalizedLicense = normalizeString(entry.license) ?? "UNKNOWN";
      const { text: licenseText, source: licenseSource } =
        await readFirstMatchingFile(
          entry.paths,
          LICENSE_FILE_CANDIDATES,
          readTextFile,
        );
      const { text: noticeText } = await readFirstMatchingFile(
        entry.paths,
        NOTICE_FILE_CANDIDATES,
        readTextFile,
      );

      packages.push({
        id: createPackageId(entry.name, versions),
        name: entry.name,
        versions,
        license: normalizedLicense,
        homepage: normalizeString(entry.homepage),
        description: normalizeString(entry.description),
        licenseText,
        noticeText,
        licenseSource,
        manualReviewRequired:
          isUnsupportedLicense(normalizedLicense) || licenseText === null,
      });
    }
  }

  packages.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.versions.join(",").localeCompare(right.versions.join(",")),
  );

  return {
    generatedAt,
    packageCount: packages.length,
    manualReviewRequiredCount: packages.filter(
      (pkg) => pkg.manualReviewRequired,
    ).length,
    licenses: createLicenseSummary(packages),
    packages,
  };
}

export function assertNoUnknownLicenses(inventory) {
  const unsupportedPackages = inventory.packages.filter((pkg) =>
    isUnsupportedLicense(pkg.license),
  );

  if (unsupportedPackages.length === 0) {
    return;
  }

  const details = unsupportedPackages
    .map((pkg) => `${pkg.name} (${pkg.license})`)
    .join(", ");

  throw new Error(`Unknown or unsupported licenses detected: ${details}`);
}
