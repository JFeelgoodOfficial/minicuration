'use strict'
// Reads .env.local so the setup script is configured the same way `vercel dev`
// is, instead of needing settings pasted onto the command line. Real
// environment variables win, so nothing here overrides Vercel.
const fs = require('fs')
const path = require('path')

function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(__dirname, '..', name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '')
    }
    return name
  }
  return null
}

module.exports = { loadEnvFile }
