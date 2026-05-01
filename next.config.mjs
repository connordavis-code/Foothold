/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server actions are stable in Next 14, but we explicitly opt in for safety.
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
