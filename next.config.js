/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No `output: "standalone"` — Vercel handles Next.js bundling automatically.
  // Setting it makes Next.js wrap itself as a single serverless handler that
  // intercepts every path, including /srv/* which we route to the Python
  // function via vercel.json.
};

module.exports = nextConfig;
