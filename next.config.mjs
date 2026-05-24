/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "15mb" } },
  output: "standalone",
};
export default nextConfig;
