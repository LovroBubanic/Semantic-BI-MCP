import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sql.js"],
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
    "/api/[transport]": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
};

export default nextConfig;
