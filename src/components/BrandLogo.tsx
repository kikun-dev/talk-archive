import Image from "next/image";
import { APP_NAME } from "@/lib/brand";

type BrandLogoProps = {
  className?: string;
  loading?: "eager" | "lazy";
};

export function BrandLogo({
  className = "",
  loading = "eager",
}: BrandLogoProps) {
  return (
    <Image
      src="/header.png"
      alt={APP_NAME}
      width={2172}
      height={724}
      sizes="(max-width: 640px) 176px, 224px"
      loading={loading}
      className={`block h-auto w-full ${className}`.trim()}
    />
  );
}
