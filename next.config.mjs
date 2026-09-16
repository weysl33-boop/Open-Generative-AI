/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
