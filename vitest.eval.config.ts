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
          decoratorMetadata: true
        }
      }
    })
  ],
  
  test: {
    // Run only eval files
    include: ["**/*.eval.ts", "**/*.eval.vitest.ts"],
    exclude: ["node_modules/**", "dist/**"],
    
    // Node environment for eval tests (matching your Jest config)
    environment: "node",
    
    // Setup files
    setupFiles: ["./vitest.setup.ts"],
    
    // Global test timeout (30 seconds for eval tests)
    testTimeout: 30000,
    
    // Enable global test functions (describe, it, test, etc.)
    globals: true
  },
  
  // Module resolution
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  },
  
  // Disable esbuild since we"re using SWC
  esbuild: false,
  
  // Dependency optimization
  optimizeDeps: {
    exclude: ["node_modules"]
  }
})
