// Paste this loader into your existing Dublin Dashboard script in Scriptable.
// The dashboard itself is downloaded from the main branch when the widget runs.
const sourceUrl = "https://raw.githubusercontent.com/sammcentee/dublin-dashboard/main/dashboard.js";
const fm = FileManager.local();
const folder = fm.joinPath(fm.documentsDirectory(), "DublinDashboard");
if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
const savedScript = fm.joinPath(folder, "github-source.js");
const AsyncFunction = (async function () {}).constructor;
let run;

try {
  const request = new Request(sourceUrl);
  request.timeoutInterval = 5;
  request.headers = { "Cache-Control": "no-cache" };
  const source = await request.loadString();
  if (request.response.statusCode !== 200) throw new Error("GitHub returned HTTP " + request.response.statusCode);
  run = new AsyncFunction(source);
  fm.writeString(savedScript, source);
} catch (error) {
  console.log("GitHub update unavailable: " + String(error));
  if (!fm.fileExists(savedScript)) throw new Error("Run this script while connected to the internet to download the dashboard first. " + String(error));
  run = new AsyncFunction(fm.readString(savedScript));
}

await run();
