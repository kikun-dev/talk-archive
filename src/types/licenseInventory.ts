export type LicenseSummary = {
  license: string;
  count: number;
};

export type LicensePackage = {
  id: string;
  name: string;
  versions: string[];
  license: string;
  homepage: string | null;
  description: string | null;
  licenseText: string | null;
  noticeText: string | null;
  licenseSource: string | null;
  manualReviewRequired: boolean;
};

export type LicenseInventory = {
  packageCount: number;
  manualReviewRequiredCount: number;
  licenses: LicenseSummary[];
  packages: LicensePackage[];
};
