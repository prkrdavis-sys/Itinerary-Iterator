import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  globIgnores: ["**/*.pmtiles"],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  manifestTransforms: [
    (entries) => ({
      manifest: entries.map((entry) => ({
        ...entry,
        url: encodeURI(entry.url),
      })),
      warnings: [],
    }),
  ],
});
