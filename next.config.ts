import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; it must stay external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],

  webpack(config) {
    // src/lib uses NodeNext-style ".js" specifiers so it can be compiled and
    // unit-tested with plain tsc, outside the Next toolchain. Teach webpack to
    // resolve those back to the TypeScript sources.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
