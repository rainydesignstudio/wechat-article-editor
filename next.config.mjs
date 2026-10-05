/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate validation/build output while the user's development server is running.
  distDir: process.env.ARTICLE_BUILD_DIR || '.next',
  agentRules: false,
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
