import Image from "next/image";
import { APP_NAME } from "@/lib/brand";

type BrandLogoProps = {
  className?: string;
  loading?: "eager" | "lazy";
  // 実際の表示幅に合わせて利用箇所ごとに上書きする（既定はサイドバー幅）
  sizes?: string;
};

export function BrandLogo({
  className = "",
  loading = "eager",
  sizes = "(max-width: 640px) 176px, 224px",
}: BrandLogoProps) {
  return (
    <Image
      src="/header.png"
      alt={APP_NAME}
      width={2172}
      height={724}
      sizes={sizes}
      loading={loading}
      className={`block h-auto w-full ${className}`.trim()}
    />
  );
}
