import { defineConfig, devices } from '@playwright/test'

// In CI: BASE_URL is the Vercel preview URL set in the workflow env.
// In dev: falls back to local static file server on port 3000.
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Forbid test.only() in CI so no tests are accidentally skipped.
  forbidOnly: !!process.env.CI,
  // Retry twice on CI to reduce flakiness noise from static server startup.
  retries: process.env.CI ? 2 : 0,
  // Serial in CI (one worker) avoids race conditions on the shared static server.
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: BASE_URL,
    // Capture trace on first retry so failures are debuggable.
    trace: 'on-first-retry',
    // Capture screenshot on failure.
    screenshot: 'only-on-failure',
  },

  projects: [
    // ── Desktop browsers ──────────────────────────────────────────────────
    {
      name: 'chrome-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'] },
    },

    // ── Mobile browsers ───────────────────────────────────────────────────
    // iPhone 14: critical for validating flip card touch interactions.
    {
      name: 'mobile-safari-iphone14',
      use: { ...devices['iPhone 14'] },
    },
    // Pixel 7 represents a mid-range Android device.
    {
      name: 'mobile-chrome-android',
      use: { ...devices['Pixel 7'] },
    },
  ],

  // Start a local static file server when no BASE_URL is provided (dev mode).
  // In CI with a Vercel preview URL, the server is not needed.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npx serve . -l 3000 --no-clipboard',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
})
