import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

/** @type {Record<string, string>} */
const FILES = {
  "cph-airport.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Copenhagen_Airport_Terminal_3.jpg/1280px-Copenhagen_Airport_Terminal_3.jpg",
  "winkel-43.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Winkel_43%2C_Amsterdam.jpg/1280px-Winkel_43%2C_Amsterdam.jpg",
  "amsterdam-nine-streets.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Negen_Straatjes_Amsterdam.jpg/1280px-Negen_Straatjes_Amsterdam.jpg",
  "dampkring.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Amsterdam_-_Oudezijds_Voorburgwal_-_Bulldog_The_Energy_Palace.jpg/1280px-Amsterdam_-_Oudezijds_Voorburgwal_-_Bulldog_The_Energy_Palace.jpg",
  "reguliersgracht.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Reguliersgracht%2C_Amsterdam.jpg/1280px-Reguliersgracht%2C_Amsterdam.jpg",
  "de-pijp-street.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Albert_Cuyp_Market%2C_Amsterdam.jpg/1280px-Albert_Cuyp_Market%2C_Amsterdam.jpg",
  "waterlooplein.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Waterlooplein%2C_Amsterdam.jpg/1280px-Waterlooplein%2C_Amsterdam.jpg",
  "bluebird-area.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nieuwmarkt%2C_Amsterdam.jpg/1280px-Nieuwmarkt%2C_Amsterdam.jpg",
  "oude-kerk.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Oude_Kerk%2C_Amsterdam.jpg/1280px-Oude_Kerk%2C_Amsterdam.jpg",
  "rotterdam-city.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Rotterdam_skyline_2017.jpg/1280px-Rotterdam_skyline_2017.jpg",
  "loos-rotterdam.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Veerhaven%2C_Rotterdam.jpg/1280px-Veerhaven%2C_Rotterdam.jpg",
  "maassilo.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Maassilo%2C_Rotterdam.jpg/1280px-Maassilo%2C_Rotterdam.jpg",
  "euromast.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Euromast_Rotterdam.jpg/1280px-Euromast_Rotterdam.jpg",
  "hotel-new-york.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Hotel_New_York_%28Rotterdam%29.jpg/1280px-Hotel_New_York_%28Rotterdam%29.jpg",
  "boniface-bridge.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Bonifaciusbrug%2C_Brugge.jpg/1280px-Bonifaciusbrug%2C_Brugge.jpg",
  "ezelpoort.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Ezelpoort_Brugge.jpg/1280px-Ezelpoort_Brugge.jpg",
  "minnewater.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Minnewaterpark_Brugge.jpg/1280px-Minnewaterpark_Brugge.jpg",
  "westerlicht.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Vuurtoren_Westerlicht.jpg/1280px-Vuurtoren_Westerlicht.jpg",
  "de-waag-amsterdam.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/De_Waag%2C_Amsterdam.jpg/1280px-De_Waag%2C_Amsterdam.jpg",
  "badhoevedorp-area.jpg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Badhoevedorp.jpg/1280px-Badhoevedorp.jpg",
};

const outDir = new URL("../public/photos/", import.meta.url);

async function download(name, url) {
  const dest = new URL(name, outDir);
  if (existsSync(dest)) {
    console.log(`skip ${name}`);
    return;
  }
  const response = await fetch(url, {
    headers: { "User-Agent": "Itinerary-Iterator/1.0 (photo sync)" },
  });
  if (!response.ok) {
    console.warn(`FAIL ${name}: ${response.status} ${url}`);
    return;
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
  console.log(`saved ${name}`);
}

mkdirSync(outDir, { recursive: true });
for (const [name, url] of Object.entries(FILES)) {
  await download(name, url);
}
