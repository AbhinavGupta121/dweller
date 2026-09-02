import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `base: "./"` makes the build work from any path, which means the same
 * artefact deploys to GitHub Pages under a repo subdirectory, to Cloudflare
 * Pages at a root, or straight off a file server, with no rebuild.
 */
/**
 * Vite rejects requests whose Host header it does not recognise, which blocks
 * every tunnel hostname with a 403. Geolocation needs a secure context, and a
 * tunnel is the only way to get HTTPS onto a phone without deploying, so these
 * have to be allowed or testing on an actual walk is impossible. A leading dot
 * matches subdomains.
 */
const TUNNEL_HOSTS = [
  ".trycloudflare.com",
  ".ngrok-free.app",
  ".ngrok.io",
  ".loca.lt",
  ".tailscale.net",
  ".ts.net",
];

export default defineConfig({
  plugins: [react()],
  base: "./",
  optimizeDeps: {
    /**
     * MapLibre ships its tile-parsing web worker as a separate entry that the
     * dependency optimiser rewrites but does not emit, so dev warns that
     * `maplibre-gl-worker.mjs` is missing and vector tiles never get parsed —
     * a black map. Leaving it unbundled in dev costs a few extra requests on
     * first load and nothing at all in the build.
     */
    exclude: ["maplibre-gl"],
  },
  build: {
    target: "es2020",
    /**
     * MapLibre is about 950 kB on its own and sets the floor for the map chunk,
     * so the interesting number is the entry chunk that gates first paint. That
     * one is a few hundred kB and the map is lazy-loaded behind it; this limit
     * is set just above MapLibre so a genuine regression still trips it.
     */
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: TUNNEL_HOSTS,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: TUNNEL_HOSTS,
  },
});
