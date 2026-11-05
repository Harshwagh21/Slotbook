import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg is a Node-only driver; keep it out of the server bundle.
  serverExternalPackages: ["pg"],
  // Do not generate AGENTS.md on `next dev`.
  agentRules: false,
};

export default nextConfig;
