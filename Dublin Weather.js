// Paste this code into a new Dublin Weather script in Scriptable.
// Original code: MIT, copyright (c) 2026 Sam McEntee.
// Provider credits: https://github.com/sammcentee/dublin-dashboard/blob/main/NOTICE.md
const sourceUrl = "https://raw.githubusercontent.com/sammcentee/dublin-dashboard/main/home-widgets.js";
const fm = FileManager.local();
const folder = fm.joinPath(fm.documentsDirectory(), "DublinDashboardHome");
if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
const savedScript = fm.joinPath(folder, "home-source.js");
const AsyncFunction = (async function () {}).constructor;
let run;

try {
  const request = new Request(sourceUrl);
  request.timeoutInterval = 5;
  request.headers = { "Cache-Control": "no-cache" };
  const source = await request.loadString();
  if (request.response.statusCode !== 200) throw new Error("GitHub returned HTTP " + request.response.statusCode);
  run = new AsyncFunction("view", source);
  fm.writeString(savedScript, source);
} catch (error) {
  console.log("GitHub update unavailable: " + String(error));
  if (!fm.fileExists(savedScript)) throw new Error("Use the internet for the first run of this script. " + String(error));
  run = new AsyncFunction("view", fm.readString(savedScript));
}

await run("weather");
