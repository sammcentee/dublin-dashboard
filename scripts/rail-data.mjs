// NTA / TFI GTFS decoding runs on GitHub, keeping the phone download small.
export async function unzipRail(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const v = new DataView(bytes.buffer), names = new Set(["feed_info.txt", "stop_times.txt", "trips.txt", "calendar.txt", "calendar_dates.txt"]);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || v.getUint32(end, true) !== 0x06054b50) throw new Error("TFI archive not recognised");
  let pos = v.getUint32(end + 16, true);
  const count = v.getUint16(end + 10, true), files = {};
  for (let i = 0; i < count; i++) {
    if (v.getUint32(pos, true) !== 0x02014b50) throw new Error("Invalid TFI ZIP directory");
    const method = v.getUint16(pos + 10, true), size = v.getUint32(pos + 20, true), n = v.getUint16(pos + 28, true), extra = v.getUint16(pos + 30, true), comment = v.getUint16(pos + 32, true), local = v.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + n));
    if (names.has(name)) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      let stream = new Blob([bytes.subarray(start, start + size)]).stream();
      if (method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
      else if (method !== 0) throw new Error("Unsupported TFI archive format");
      files[name] = await new Response(stream).text();
    }
    pos += 46 + n + extra + comment;
  }
  if (!files["stop_times.txt"] || !files["trips.txt"]) throw new Error("TFI timetable missing");
  return files;
}
export function extractRailSchedule(files) {
  function readCsv(name, visit) {
    const text = (files[name] || "").replace(/^\uFEFF/, "");
    let columns, row = [], field = "", quoted = false;
    function finishRow() {
      row.push(field);
      if (!columns) columns = row;
      else if (row.some(value => value !== "")) {
        const record = {};
        columns.forEach((column, i) => record[column] = row[i] || "");
        visit(record);
      }
      row = [];
      field = "";
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        finishRow();
        if (char === "\r" && text[i + 1] === "\n") i++;
      } else field += char;
    }
    if (field || row.length) finishRow();
  }
  function seconds(time) {
    const parts = time.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  function dateKey(date) { return date.toISOString().slice(0, 10).replace(/-/g, ""); }
  function parseDate(key) {
    return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
  }

  let feed = {};
  readCsv("feed_info.txt", row => feed = row);
  const pairs = {
    sallinsHeuston: ["8260IR0060", "8220IR0132", 22 * 3600],
    connollySallins: ["8220IR0007", "8260IR0060", 18 * 3600]
  };
  const stations = new Set(["8260IR0060", "8220IR0132", "8220IR0007"]);
  const stops = {};
  readCsv("stop_times.txt", row => {
    if (stations.has(row.stop_id)) (stops[row.trip_id] || (stops[row.trip_id] = {}))[row.stop_id] = row;
  });
  const routes = { sallinsHeuston: [], connollySallins: [] };
  const serviceIds = new Set();
  readCsv("trips.txt", trip => {
    const times = stops[trip.trip_id];
    if (!times) return;
    for (const name of Object.keys(pairs)) {
      const [origin, destination, cutoff] = pairs[name];
      const from = times[origin], to = times[destination];
      if (!from || !to || Number(from.stop_sequence) >= Number(to.stop_sequence) ||
          from.pickup_type === "1" || to.drop_off_type === "1" || seconds(from.departure_time) <= cutoff) continue;
      routes[name].push({ departure: from.departure_time, arrival: to.arrival_time,
        serviceId: trip.service_id, tripId: trip.trip_id,
        destination: trip.trip_headsign, trainCode: trip.trip_short_name });
      serviceIds.add(trip.service_id);
    }
  });
  for (const route of Object.values(routes)) route.sort((a, b) => seconds(a.departure) - seconds(b.departure));

  const services = {};
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  readCsv("calendar.txt", row => {
    if (serviceIds.has(row.service_id)) services[row.service_id] = {
      start: row.start_date, end: row.end_date,
      weekdays: weekdays.map(day => row[day]).join(""), exceptions: {}
    };
  });
  readCsv("calendar_dates.txt", row => {
    if (!serviceIds.has(row.service_id)) return;
    const service = services[row.service_id] || (services[row.service_id] = {
      start: row.date, end: row.date, weekdays: "0000000", exceptions: {}
    });
    service.exceptions[row.date] = Number(row.exception_type);
    if (service.weekdays === "0000000") {
      service.start = service.start < row.date ? service.start : row.date;
      service.end = service.end > row.date ? service.end : row.date;
    }
  });

  let validThrough = "";
  for (const service of Object.values(services)) {
    const limit = feed.feed_end_date || service.end;
    const last = service.end < limit ? service.end : limit;
    if (service.weekdays.includes("1")) {
      const date = parseDate(last);
      while (dateKey(date) >= service.start) {
        const key = dateKey(date), exception = service.exceptions[key];
        if (exception === 1 || (exception !== 2 && service.weekdays[(date.getUTCDay() + 6) % 7] === "1")) {
          if (key > validThrough) validThrough = key;
          break;
        }
        date.setUTCDate(date.getUTCDate() - 1);
      }
    }
    for (const [key, exception] of Object.entries(service.exceptions)) {
      if (exception === 1 && key <= (feed.feed_end_date || key) && key > validThrough) validThrough = key;
    }
  }
  return {
    source: "https://www.transportforireland.ie/transitData/Data/GTFS_Irish_Rail.zip",
    sourceInfoUrl: "https://www.transportforireland.ie/transitData/PT_Data.html",
    retrievedAt: new Date().toISOString().slice(0, 10),
    feedVersion: feed.feed_version, feedStart: feed.feed_start_date, feedEnd: feed.feed_end_date,
    sourceLastModified: null, sourceETag: null, timezone: "Europe/Dublin",
    routes, services, validThrough,
    attribution: "Timetable data: National Transport Authority, CC BY 4.0. Timetable snapshot; not a live service guarantee."
  };
}
