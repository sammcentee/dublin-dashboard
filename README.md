# Dublin Dashboard

A large iPhone widget for the free Scriptable app. Shows Dublin weather from Yr,
a daylight scale and countdown, today's qualifying direct Irish Rail trains,
and a Parnell-to-Abbey Street Luas connection toward The Point.

## Set up on your phone

1. Open `Dublin Dashboard.js` in this repository and choose **Raw**.
2. Copy the entire small loader script.
3. In Scriptable, open your existing **Dublin Dashboard** script.
4. Replace its contents with the loader and press the run button while online.
5. Keep the large widget selected to use **Dublin Dashboard**.

The phone downloads `dashboard.js` from this repository's `main` branch each time
the widget runs. If GitHub is unreachable or returns invalid JavaScript, it uses
the saved copy. The first run needs an internet connection. The loader checks
syntax before saving; a runtime bug in an update still needs correcting or
reverting in Git.

## Make updates with Git

Edit **dashboard.js** to change the dashboard. Commit and push to **main**; the
phone picks up the change on a subsequent widget run. GitHub may cache raw files
for a few minutes, and iOS controls background refresh timing. Running the script
manually opens Scriptable. There is no silent tap-to-refresh in this setup.

Keep **Dublin Dashboard.js** as the phone loader. Changing the loader itself
requires replacing that small script on the phone again.

```sh
git clone https://github.com/sammcentee/dublin-dashboard.git
cd dublin-dashboard
# Edit dashboard.js, then:
git add dashboard.js
git commit -m "Describe the dashboard change"
git push origin main
```

Test the loader locally with Node.js: `node loader.test.mjs`.

## Data sources

Weather: [Yr](https://www.yr.no/en/forecast/daily-table/2-2964574/Ireland/Leinster/Dublin%20City/Dublin).
Daylight: [Sunrise-Sunset.org](https://sunrise-sunset.org/).
Rail timetable: [NTA / TFI](https://www.transportforireland.ie/transitData/PT_Data.html), CC BY 4.0.
Rail predictions: [Irish Rail](https://api.irishrail.ie/realtime/).
Luas predictions: [Transport Infrastructure Ireland](https://data.gov.ie/dataset/luas-forecasting-api), CC BY 4.0.

The seven-minute Luas allowance starts at Parnell and includes the ride to
Marlborough and the walk to Abbey Street. It is an estimate, not a guarantee.
Train rows show departures for today only, strictly after 22:00 from Sallins to
Heuston and strictly after 18:00 from Connolly to Sallins.
