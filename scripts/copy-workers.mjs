import { copyFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicDir = path.join(root, "public");

copyFileSync(
  path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"),
  path.join(publicDir, "maplibre-gl-worker.js"),
);
copyFileSync(
  path.join(root, "node_modules/mapbox-gl/dist/mapbox-gl-csp-worker.js"),
  path.join(publicDir, "mapbox-gl-csp-worker.js"),
);
