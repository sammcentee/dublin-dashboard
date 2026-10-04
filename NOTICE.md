# Third-party notices

The project's original code, documentation and banner are covered by the
[MIT licence](LICENSE). This does not relicense third-party code, data, service
names or branding. Preserve the notices below when redistributing the relevant
material. Provider credits appear in this file and the README, not in the widget.

## Weather: MET Norway, via Yr

Weather data from **the Norwegian Meteorological Institute (MET Norway)**,
retrieved from [Yr's Dublin page](https://www.yr.no/en/forecast/daily-table/2-2964574/Ireland/Leinster/Dublin%20City/Dublin).
Yr is a service from MET Norway and NRK.

MET's [data policy](https://api.met.no/doc/License) offers its data and products
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and
[NLOD 2.0](https://data.norge.no/nlod/en/2.0).
See its [crediting policy](https://www.met.no/en/free-meteorological-data/Licensing-and-crediting).
Temperatures are rounded for display, and the weather description's first
letter is capitalized. The site-supplied feels-like value is retained.

These data terms do not establish a licence for NRK's webpage presentation.
The current webpage reader is unofficial; [Yr's data-access guidance](https://hjelp.yr.no/hc/en-us/articles/360001946134-Data-access-and-terms-of-service)
points developers to MET's API. No Yr images, weather icons or logos are copied.

## Rail timetable: National Transport Authority

Timetable data: **National Transport Authority (NTA)**, through Transport for
Ireland, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- [Source and licence statement](https://www.transportforireland.ie/transitData/PT_Data.html)
- [Irish Rail GTFS download](https://www.transportforireland.ie/transitData/Data/GTFS_Irish_Rail.zip)
- [NTA usage policy](https://developer.nationaltransport.ie/usagepolicy)

The embedded timetable is a filtered, converted extract of the NTA feed,
retrieved on 4 October 2026. Only qualifying direct trips for the two requested
journeys are retained. `rail.json` is refreshed from the source by a scheduled
GitHub workflow; its `checkedAt` records the last successful source download.
Refreshed feeds are filtered and converted in the same way. This is not the
complete official timetable.

NTA data is provided **as-is**, without warranties. The NTA is not responsible
for errors or inaccuracies. The timetable snapshot is not a guarantee that a
service will operate.

## Live rail predictions: Iarnród Éireann

Live rail data is provided by **Iarnród Éireann (Irish Rail)** through its
[public realtime XML API](https://api.irishrail.ie/realtime/).
The published documentation describes estimates supplied as-is, without
support; it does not state a named reuse licence. This project does not assign
MIT or CC BY terms to this feed.

The widget filters station boards, matches trains to timetable entries, and
formats departure estimates. The repository does not redistribute saved live
rail responses.

## Luas predictions: Transport Infrastructure Ireland

Luas forecast data is provided by **Transport Infrastructure Ireland (TII)**
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- [Official dataset and licence](https://data.gov.ie/dataset/luas-forecasting-api)
- [Forecast API](https://luasforecasts.rpa.ie/xml/get.ashx?action=forecast&stop=PAR&encrypt=false)

The widget converts minute forecasts into estimated arrival times and selects
possible Green Line to Red Line connections. The five-minute allowance from
Parnell is calculated by this project. It is not a TII connection guarantee.

## SunCalc solar calculation: BSD-2-Clause

The `sunDay` function in `dashboard.js` is adapted from
[SunCalc by Volodymyr Agafonkin](https://github.com/mourner/suncalc), pinned to
[source commit ecb6bb0](https://github.com/mourner/suncalc/tree/ecb6bb0b0f3a5003298cfb536e46176117caf4e5).
Only solar coordinates, solar noon, sunrise/sunset and civil dawn/dusk are
retained. Coordinates are fixed to Dublin, and the delta-T approximation covers
2005–2050. The [upstream BSD-2-Clause licence](https://github.com/mourner/suncalc/blob/ecb6bb0b0f3a5003298cfb536e46176117caf4e5/LICENSE)
is reproduced below and also included in `dashboard.js` for standalone copies.

```
Copyright (c) 2026, Volodymyr Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.
   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

No affiliation with or endorsement by any provider or upstream author is implied.
