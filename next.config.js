/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode : false,
    // Boots src/instrumentation.js, which starts the reminder scheduler.
    experimental: { instrumentationHook: true }
}

module.exports = nextConfig
