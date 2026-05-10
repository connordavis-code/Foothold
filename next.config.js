/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // R.2: /drift folded into /dashboard as inline module
      { source: '/drift', destination: '/dashboard#drift', permanent: true },
    ];
  },
};

export default nextConfig;
