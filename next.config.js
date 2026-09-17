// Sent on every response. None of these change how the app behaves; they close
// the defaults a browser falls back to when a header is missing.
//
// `frame-ancestors` is the one that was actually reachable: without it any page
// anywhere could embed this app in an iframe. The session cookie is SameSite=Lax
// so a framed copy is signed out, which is what kept it from being worse - but
// the login screen inside somebody else's page is a phishing surface, and the
// header costs nothing. Only frame-ancestors is set, not a full CSP: a script
// policy has to be built against what the app actually loads, and getting that
// wrong is a blank page at a site.
//
// 'self' and not 'none': the public signing page shows the claim in an
// <object> pointing at this same origin, and whoever is signing has to be able
// to read the document. 'none' would have left them a blank box above the pad.
const securityHeaders = [
    { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    // The PDF and menu endpoints stream bytes straight from Drive, so the
    // browser is told to believe the content type instead of sniffing one.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Reset links and signing links carry their token in the URL. This keeps
    // that URL out of the Referer header on the way to any other origin.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    // Nothing in the app asks for these, and saying so stops an embedded
    // document from asking on its behalf.
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode : false,
    // The version of the framework is not something a visitor needs.
    poweredByHeader: false,
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
    },
    async headers() {
        return [{ source: '/:path*', headers: securityHeaders }];
    }
}

module.exports = nextConfig
