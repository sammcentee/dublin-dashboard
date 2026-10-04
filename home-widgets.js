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
  text(row, label, 9, "aeaeb2", true);
  row.addSpacer();
  const color = api.freshnessColor(age);
  text(row, "● ", 14, color, true);
  const elapsed = row.addDate(now);
  elapsed.applyTimerStyle();
  elapsed.font = Font.semiboldMonospacedSystemFont(10);
  elapsed.textColor = new Color(color);
  elapsed.lineLimit = 1;
  elapsed.minimumScaleFactor = 0.75;
  widget.addSpacer(3);
}

const started = new Date();
const w = new ListWidget();
w.backgroundColor = new Color("1c1c1e");
w.setPadding(8, 9, 8, 9);
let event, green;

if (view === "weather") {
  const [yr, sun] = await results([api.weather(started), api.daylight(started)]);
  const now = new Date();
  header(w, "WEATHER", now, yr ? now.getTime() - yr.fetchedAt : Infinity);
  const temperature = w.addStack();
  temperature.centerAlignContent();
  text(temperature, yr ? Math.round(yr.temperature) + "°C" : "Unavailable", yr ? 28 : 17, "f2f2f7", true);
  if (yr) {
    temperature.addSpacer();
    const feels = temperature.addStack();
    feels.layoutVertically();
    text(feels, "Feels like", 8, "aeaeb2");
    text(feels, Math.round(yr.feelsLike) + "°C", 12, "aeaeb2", true);
    text(w, (yr.description || "Conditions unavailable") + (yr.stale ? " · cached" : ""), 10, "8e8e93").lineLimit = 2;
  }
  w.addSpacer(4);
  event = sun && api.nextLight(sun, now);
  if (event) {
    const row = w.addStack();
    text(row, event.name === "Bright again" ? "Bright in " : "Dark in ", 9, "b7a17a");
    const countdown = row.addDate(event.date);
    countdown.applyTimerStyle();
    countdown.font = Font.semiboldMonospacedSystemFont(11);
    countdown.textColor = new Color("b7a17a");
    countdown.lineLimit = 1;
    countdown.minimumScaleFactor = 0.75;
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
    text(w, label, 9, "8eafcf", true);
    if (train.departure) {
      const row = w.addStack();
      row.centerAlignContent();
      text(row, clock(train.departure), 20, "8eafcf", true);
      row.addSpacer();
      const detail = row.addStack();
      detail.layoutVertically();
      text(detail, "After " + cutoff, 8, "8e8e93");
      text(detail, train.live ? "live" : "scheduled", 8, "8e8e93");
    } else {
      const message = train.message === "TFI timetable needs refresh" ? "Refresh timetable" : train.message;
      text(w, message, 11, "8eafcf", true).lineLimit = 2;
      text(w, "After " + cutoff, 8, "8e8e93");
    }
    w.addSpacer(3);
  }
  w.addSpacer();
  text(w, api.dayLabel(now) + " · direct", 8, "8e8e93");
  if (rail?.unverified) text(w, "Timetable unchecked", 8, "ff9f0a");
  text(w, "NTA/TFI · Irish Rail", 7, "8e8e93");
} else if (view === "luas") {
  const feeds = await results([api.luas("PAR", started), api.luas("ABB", started)]);
  const now = new Date();
  const [parnell, abbey] = feeds.map(feed => feed && Math.abs(now - feed.created) <= 3 * 60000 ? feed : null);
  const connection = api.connection(parnell, abbey, now);
  green = connection.green;
  const red = connection.red;
  header(w, "LUAS CONNECTION", now, parnell && abbey ? now - Math.min(parnell.created.getTime(), abbey.created.getTime()) : Infinity);
  const stops = w.addStack();
  for (const [label, line, value, detail, color] of [
    ["Parnell", "Green Line · southbound", green ? green.dueNow ? "Due" : clock(green.arrival) : parnell ? "No tram forecast" : "Feed unavailable", green?.destination || "", "8cba9a"],
    ["Abbey Street", "Red Line → The Point", red ? clock(red.arrival) : !green ? "No Green Line tram" : abbey ? "No connection yet" : "Feed unavailable", red ? "Catchable connection" : "", "c99a9a"]
  ]) {
    const stop = stops.addStack();
    stop.layoutVertically();
    stop.size = new Size(128, 0);
    text(stop, label, 11, color, true);
    text(stop, line, 9, color);
    text(stop, value, /^\d\d:\d\d$/.test(value) || value === "Due" ? 23 : 11, color, true).lineLimit = 2;
    if (detail) text(stop, detail, 9, "8e8e93");
    if (label === "Parnell") stops.addSpacer();
  }
  w.addSpacer(3);
  text(w, "Estimated · 7 min from Parnell via Marlborough", 9, "8e8e93");
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
  if (view !== "luas") await w.presentSmall();
  else await w.presentMedium();
}
Script.complete();
