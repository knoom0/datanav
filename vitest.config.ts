import path from "path"

import swc from "unplugin-swc"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: "typescript",
          tsx: true,
          decorators: true
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          react: {
            runtime: "automatic"
          }
        }
      }
    })
  ],
  
  test: {
    // Include all test files except eval tests
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", "dist/**", "**/*.eval.ts", "**/*.eval.vitest.ts"],
    
    // Setup files - handle both environments
    setupFiles: ["./vitest.setup.ts"],
    
    // Enable global test functions (describe, it, test, etc.)
    globals: true,
    
    // Test timeout (15 seconds default)
    testTimeout: 30000,
    
    // Default environment for most tests  
    environment: "node"
  },
  
  // Module resolution
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "next-intl": path.resolve(__dirname, "test/mocks/next-intl.ts")
    }
  },
  
  // Disable esbuild since we"re using SWC
  esbuild: false,
  
  // Dependency optimization
  optimizeDeps: {
    exclude: ["node_modules"]
  }
})
