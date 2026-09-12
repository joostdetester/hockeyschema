import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// __APP_VERSION__ (zie onderin App.jsx) is het versienummer dat onderaan elke pagina staat.
// package.json's version houdt handmatig alleen major.minor bij (bv. "1.1.0" - het laatste
// segment is een placeholder); CI vult in ci.yml het echte patch-cijfer per build aan via
// VITE_BUILD_NUMBER=${{ github.run_number }}, zodat elke deploy (test/acceptance/main) zijn
// eigen oplopende, herleidbare versienummer krijgt zonder dat er iets teruggecommit hoeft te
// worden naar (beschermde) branches. Lokaal (`npm run dev`/handmatige build zonder die env var)
// blijft package.json's eigen versie gewoon staan, als duidelijk "geen CI-build"-signaal.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const buildNumber = process.env.VITE_BUILD_NUMBER;
const baseVersion = pkg.version.replace(/\.\d+$/, '');
const appVersion = buildNumber ? `${baseVersion}.${buildNumber}` : pkg.version;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
