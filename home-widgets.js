// Compact Home Screen widgets. Original code: MIT, copyright (c) 2026 Sam McEntee.
// Provider credits and licences: https://github.com/sammcentee/dublin-dashboard/blob/main/NOTICE.md
// The named phone loader supplies view: weather, trains or luas.
const fm = FileManager.local();
const folder = fm.joinPath(fm.documentsDirectory(), "DublinDashboardHome");
if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
const savedData = fm.joinPath(folder, "data-source.js");
const AsyncFunction = (async function () {}).constructor;

function dataLibrary(source) {
  const end = source.indexOf("// Run the dashboard.");
  const cache = 'fm.joinPath(fm.documentsDirectory(), "DublinDashboard")';
  if (end < 0 || !source.includes(cache)) throw new Error("Dashboard data format changed");
  // Reuse the data functions without running the large widget or using its cache.
  const code = source.slice(0, end).replace(cache, 'fm.joinPath(fm.documentsDirectory(), "DublinDashboardHome")');
  return new AsyncFunction(code + "\nreturn {weather,daylight,nextLight,lightLevel,timetable,railBoard,nextTrain,luas,connection,clock,dayLabel,dateKey,isoDay,text,scale,freshnessColor};");
}
let api;
try {
  const request = new Request("https://raw.githubusercontent.com/sammcentee/dublin-dashboard/main/dashboard.js");
  request.timeoutInterval = 5;
  request.headers = { "Cache-Control": "no-cache" };
  const source = await request.loadString();
  if (request.response.statusCode !== 200) throw new Error("GitHub returned HTTP " + request.response.statusCode);
  api = await dataLibrary(source)();
  fm.writeString(savedData, source);
} catch (error) {
  console.log("Dashboard data update unavailable: " + String(error));
  if (!fm.fileExists(savedData)) throw new Error("Use the internet for the first run of this script.");
  api = await dataLibrary(fm.readString(savedData))();
}
const { text, clock } = api;

async function results(jobs) {
  const settled = await Promise.allSettled(jobs);
  settled.forEach(job => { if (job.status === "rejected") console.log(String(job.reason)); });
  return settled.map(job => job.status === "fulfilled" ? job.value : null);
}
function header(widget, label, now, age) {
  const row = widget.addStack();
  row.centerAlignContent();
  text(row, label, 10, "aeaeb2", true);
  row.addSpacer();
  const color = api.freshnessColor(age);
  text(row, "● ", 16, color, true);
  const elapsed = row.addDate(now);
  elapsed.applyTimerStyle();
  elapsed.font = Font.semiboldMonospacedSystemFont(11);
  elapsed.textColor = new Color(color);
  widget.addSpacer(4);
}
function transitRow(widget, label, value, detail, color) {
  const row = widget.addStack();
  row.centerAlignContent();
  text(row, label, 11, color, true);
  row.addSpacer();
  text(row, value, /^\d\d:\d\d$/.test(value) || value === "Due" ? 21 : 11, color, true);
  text(widget, detail, 9, "8e8e93");
}

const started = new Date();
const w = new ListWidget();
w.backgroundColor = new Color("1c1c1e");
w.setPadding(10, 12, 10, 12);
let event, green;

if (view === "weather") {
  const [yr, sun] = await results([api.weather(started), api.daylight(started)]);
  const now = new Date();
  header(w, "WEATHER", now, yr ? now.getTime() - yr.fetchedAt : Infinity);
  text(w, yr ? Math.round(yr.temperature) + "°C" : "Unavailable", yr ? 30 : 17, "f2f2f7", true);
  if (yr) {
    text(w, "Feels like " + Math.round(yr.feelsLike) + "°C", 11, "aeaeb2");
    text(w, (yr.description || "Conditions unavailable") + (yr.stale ? " · cached" : ""), 10, "8e8e93").lineLimit = 2;
  }
  w.addSpacer(4);
  event = sun && api.nextLight(sun, now);
  if (event) {
    const row = w.addStack();
    text(row, event.name + " in ", 10, "b7a17a");
    const countdown = row.addDate(event.date);
    countdown.applyTimerStyle();
    countdown.font = Font.semiboldMonospacedSystemFont(13);
    countdown.textColor = new Color("b7a17a");
  } else text(w, "Daylight unavailable", 10, "b7a17a");
  const today = sun?.days.find(day => day.date === api.isoDay(api.dateKey(now)));
  if (today) {
    const bar = w.addStack();
    bar.centerAlignContent();
    text(bar, "Dark ", 8, "8e8e93");
    bar.addImage(api.scale(api.lightLevel(today, now))).imageSize = new Size(78, 3);
    text(bar, " Bright", 8, "b7a17a");
  }
  w.addSpacer();
  text(w, "Yr · MET Norway · SunCalc", 7, "8e8e93");
} else if (view === "trains") {
  const [rail, sallins, connolly] = await results([api.timetable(started), api.railBoard("Sallins"), api.railBoard("Dublin Connolly")]);
  const now = new Date();
  header(w, "TRAINS", now, rail && !rail.unverified && sallins && connolly ? now - started : Infinity);
  for (const [route, label, cutoff, board] of [
    ["sallinsHeuston", "Sallins → Heuston", "22:00", sallins],
    ["connollySallins", "Connolly → Sallins", "18:00", connolly]
  ]) {
    const train = rail ? api.nextTrain(rail.data, route, now, board || []) : { message: "Timetable unavailable" };
    const date = train.departure ? " · " + api.dayLabel(train.departure) + " · " + (train.live ? "live" : "scheduled") : "";
    transitRow(w, label, train.message || clock(train.departure), "After " + cutoff + " · direct" + date, "8eafcf");
    w.addSpacer(5);
  }
  w.addSpacer();
  text(w, "NTA/TFI · Irish Rail" + (rail?.unverified ? " · timetable unchecked" : ""), 8, "8e8e93");
} else if (view === "luas") {
  const feeds = await results([api.luas("PAR", started), api.luas("ABB", started)]);
  const now = new Date();
  const [parnell, abbey] = feeds.map(feed => feed && Math.abs(now - feed.created) <= 3 * 60000 ? feed : null);
  const connection = api.connection(parnell, abbey, now);
  green = connection.green;
  const red = connection.red;
  header(w, "LUAS CONNECTION", now, parnell && abbey ? now - Math.min(parnell.created.getTime(), abbey.created.getTime()) : Infinity);
  transitRow(w, "Parnell · Green Line", green ? green.dueNow ? "Due" : clock(green.arrival) : parnell ? "No tram forecast" : "Feed unavailable", green ? green.destination + " · southbound" : "Southbound", "8cba9a");
  w.addSpacer(5);
  transitRow(w, "Abbey St → The Point", red ? clock(red.arrival) : !green ? "No Green Line tram" : abbey ? "No connection yet" : "Feed unavailable", "Estimated · 7 min from Parnell · via Marlborough", "c99a9a");
  const messages = feeds.map(feed => feed?.message).filter(message => message && !/operating normally/i.test(message));
  if (messages.length) text(w, [...new Set(messages)].join(" · "), 8, "ff9f0a").lineLimit = 2;
  w.addSpacer();
  text(w, "TII/Luas", 8, "8e8e93");
}
let refresh = Date.now() + 2 * 60000;
if (event) refresh = Math.min(refresh, event.date.getTime() + 1000);
if (green) refresh = Math.min(refresh, green.arrival.getTime() + 15000);
w.refreshAfterDate = new Date(refresh);
Script.setWidget(w);
if (config.runsInApp) {
  if (view === "weather") await w.presentSmall();
  else await w.presentMedium();
}
Script.complete();
