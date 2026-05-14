/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Next 15 enables `devtoolSegmentExplorer` by default. It injects `SegmentViewNode` into the
   * RSC tree and can throw "Could not find the module … segment-explorer-node.js#SegmentViewNode
   * in the React Client Manifest" plus `__webpack_modules__[moduleId] is not a function` on
   * some routes (e.g. heavy client dashboards). Disabling avoids that dev-only bundler bug.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators (related dev UI)
   */
  experimental: {
    devtoolSegmentExplorer: false
  },
  /**
   * Dev server only trusts `localhost` by default. Tunnel hostnames (ngrok, etc.) send a different
   * `Host` / `Origin`, which Next.js 15 rejects without this — HMR, `/_next/*`, and pages break.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
   */
  allowedDevOrigins: [
    "splurge-grumpily-enforced.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],
  async redirects() {
    return [{ source: "/dashboard", destination: "/app/dashboard", permanent: true }];
  },
};

export default nextConfig;

