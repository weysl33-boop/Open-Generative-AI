/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the PostgreSQL client and its Node-only parser dependencies in the
  // server runtime. Bundling this chain makes Next's page-data worker try to
  // resolve the optional `xtend/mutable` subpath as a browser dependency.
  serverExternalPackages: ['pg', 'postgres-interval', 'xtend'],
  // Verification builds must not share `.next` with whoever else is building in
  // this worktree at the same time; a concurrent prune surfaces as
  // "Cannot find module for page: /_not-found" halfway through the build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

module.exports = nextConfig;
