import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      // Server Actions のリクエストボディサイズ上限（既定は1MB）。
      // 既存の動画添付上限（MAX_ATTACH_MEDIA_FILE_SIZE = 50MB、recordUseCases.ts）を
      // 超えられるようにしつつ余裕を持たせる。#115: .eml インポートは複数ファイルを
      // まとめてアップロードするため、動画1本分の上限より大きくする必要がある
      bodySizeLimit: "60mb",
    },
  },
};

export default nextConfig;
