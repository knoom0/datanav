import type { NextConfig } from "next";

// TODO: Document or remove --no-mangling flag in package.json build script
// The flag disables name mangling which increases bundle size but may be needed for
// runtime reflection or debugging. Evaluate if this is still necessary.

const nextConfig: NextConfig = {
  // TODO: Re-enable React strict mode after resolving double-render issues with streaming
  // Strict mode is currently disabled to prevent issues with UI message stream rendering
  // and potential side effects in streaming components
  reactStrictMode: false,
};

export default nextConfig;
