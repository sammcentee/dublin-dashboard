import { writeFile } from "node:fs/promises";
import { unzipRail, extractRailSchedule } from "./rail-data.mjs";

const source = "https://www.transportforireland.ie/transitData/Data/GTFS_Irish_Rail.zip";
const response = await fetch(source, {
  headers: { "Cache-Control": "no-cache", "User-Agent": "DublinDashboard timetable updater" },
  signal: AbortSignal.timeout(60000)
});
if (!response.ok) throw new Error("TFI download returned HTTP " + response.status);
const archive = Buffer.from(await response.arrayBuffer()).toString("base64");
const data = extractRailSchedule(await unzipRail(archive));
const now = new Date();
const retrievedAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const today = retrievedAt.replace(/-/g, "");
if (!/^\d{8}$/.test(data.feedStart) || !/^\d{8}$/.test(data.validThrough) ||
    data.feedStart > today || data.validThrough < today ||
    !Array.isArray(data.routes?.sallinsHeuston) || !Array.isArray(data.routes?.connollySallins) ||
    !data.services || !data.feedVersion) throw new Error("TFI timetable is invalid or out of date");
data.retrievedAt = retrievedAt;
data.checkedAt = now.getTime();
data.sourceLastModified = response.headers.get("last-modified");
data.sourceETag = response.headers.get("etag");
await writeFile(new URL("../rail.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
console.log("Published TFI timetable checked " + now.toISOString() + "; valid through " + data.validThrough);
