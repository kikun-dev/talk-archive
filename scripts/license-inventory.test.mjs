import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoUnknownLicenses,
  createLicenseInventory,
} from "./license-inventory.mjs";

const temporaryDirectories = [];

async function createPackageDirectory(name) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "license-inventory-"));
  temporaryDirectories.push(temporaryDirectory);

  const packageDirectory = join(temporaryDirectory, name);
  await mkdir(packageDirectory, { recursive: true });

  return packageDirectory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("createLicenseInventory", () => {
  it("normalizes pnpm license output into sorted package records", async () => {
    const pkgAPath = await createPackageDirectory("pkg-a");
    const pkgBPath = await createPackageDirectory("pkg-b");

    await writeFile(join(pkgAPath, "LICENSE"), "MIT License text", "utf8");
    await writeFile(join(pkgAPath, "NOTICE"), "Notice text", "utf8");
    await writeFile(join(pkgBPath, "LICENCE.md"), "Apache License text", "utf8");

    const inventory = await createLicenseInventory(
      {
        "Apache-2.0": [
          {
            name: "pkg-b",
            versions: ["2.0.0"],
            paths: [pkgBPath],
            license: "Apache-2.0",
            homepage: "https://example.com/pkg-b",
            description: "Package B",
          },
        ],
        MIT: [
          {
            name: "pkg-a",
            versions: ["1.0.0"],
            paths: [pkgAPath],
            license: "MIT",
            homepage: "https://example.com/pkg-a",
            description: "Package A",
          },
        ],
      },
      { generatedAt: "2026-04-24T00:00:00.000Z" },
    );

    expect(inventory).toEqual({
      generatedAt: "2026-04-24T00:00:00.000Z",
      packageCount: 2,
      manualReviewRequiredCount: 0,
      licenses: [
        { license: "Apache-2.0", count: 1 },
        { license: "MIT", count: 1 },
      ],
      packages: [
        {
          id: "pkg-a@1.0.0",
          name: "pkg-a",
          versions: ["1.0.0"],
          license: "MIT",
          homepage: "https://example.com/pkg-a",
          description: "Package A",
          licenseText: "MIT License text",
          noticeText: "Notice text",
          licenseSource: "LICENSE",
          manualReviewRequired: false,
        },
        {
          id: "pkg-b@2.0.0",
          name: "pkg-b",
          versions: ["2.0.0"],
          license: "Apache-2.0",
          homepage: "https://example.com/pkg-b",
          description: "Package B",
          licenseText: "Apache License text",
          noticeText: null,
          licenseSource: "LICENCE.md",
          manualReviewRequired: false,
        },
      ],
    });
  });

  it("marks packages for manual review when license text cannot be found", async () => {
    const pkgPath = await createPackageDirectory("pkg-c");

    const inventory = await createLicenseInventory(
      {
        MIT: [
          {
            name: "pkg-c",
            versions: ["3.0.0"],
            paths: [pkgPath],
            license: "MIT",
            homepage: "",
            description: "",
          },
        ],
      },
      { generatedAt: "2026-04-24T00:00:00.000Z" },
    );

    expect(inventory.manualReviewRequiredCount).toBe(1);
    expect(inventory.packages[0]).toMatchObject({
      id: "pkg-c@3.0.0",
      licenseText: null,
      noticeText: null,
      licenseSource: null,
      homepage: null,
      description: null,
      manualReviewRequired: true,
    });
  });
});

describe("assertNoUnknownLicenses", () => {
  it("throws when inventory includes packages with unknown licenses", () => {
    expect(() =>
      assertNoUnknownLicenses({
        generatedAt: "2026-04-24T00:00:00.000Z",
        packageCount: 1,
        manualReviewRequiredCount: 1,
        licenses: [{ license: "UNKNOWN", count: 1 }],
        packages: [
          {
            id: "pkg-d@4.0.0",
            name: "pkg-d",
            versions: ["4.0.0"],
            license: "UNKNOWN",
            homepage: null,
            description: null,
            licenseText: null,
            noticeText: null,
            licenseSource: null,
            manualReviewRequired: true,
          },
        ],
      }),
    ).toThrow("Unknown or unsupported licenses detected: pkg-d (UNKNOWN)");
  });
});
