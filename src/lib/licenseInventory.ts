import licenseInventoryData from "@/generated/licenses.json";
import type { LicenseInventory, LicensePackage } from "@/types/licenseInventory";

const licenseInventory = licenseInventoryData as LicenseInventory;

export function getLicenseInventory(): LicenseInventory {
  return licenseInventory;
}

export function getLicensePackageById(id: string): LicensePackage | null {
  return (
    licenseInventory.packages.find((pkg) => pkg.id === id) ?? null
  );
}
