/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode : false,
    // Boots src/instrumentation.js, which starts the reminder scheduler.
    experimental: { instrumentationHook: true },
    // `/` used to be a page whose only job was redirect('/dashboard'). With the
    // root loading.jsx wrapping every route in a Suspense boundary, aborting
    // that boundary to redirect is what React reports as #419 - "the server
    // could not finish this Suspense boundary" - and it was landing in the
    // client error log on every visit to the root. The redirect never needed a
    // render: answering it at the HTTP layer is faster and leaves no trace.
    async redirects() {
        return [{ source: '/', destination: '/dashboard', permanent: false }];
    }
}

module.exports = nextConfig
