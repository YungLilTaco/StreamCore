/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/dashboard", destination: "/app/dashboard", permanent: true }];
  },
};

export default nextConfig;

