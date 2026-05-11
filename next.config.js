/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // R.2: /drift folded into /dashboard as inline module
      { source: '/drift', destination: '/dashboard#drift', permanent: true },
      // R.2: /insights folded into /dashboard as editorial brief card
      { source: '/insights', destination: '/dashboard#brief', permanent: true },
      {
        source: '/insights/:week',
        destination: '/dashboard?week=:week',
        permanent: true,
      },
      // R.3.1: /goals/[id] detail page folded into /goals card list.
      // Regex constraint: (?!new$) excludes /goals/new from matching;
      // [^/]+ keeps :id single-segment so /goals/:id/edit (deeper path)
      // is NOT consumed. Previous `.*` regex matched across slashes and
      // swallowed /goals/<id>/edit URLs.
      {
        source: '/goals/:id((?!new$)[^/]+)',
        destination: '/goals',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
