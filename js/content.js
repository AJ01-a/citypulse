// Static, hand-maintained content: the resource directory, the official
// guidance pages that dashboard tips link to, and the FAQ. Shared by
// index.html, resources.html and the AJ assistant.
//
// Rules for editing this file:
// - Safety guidance is quoted or closely paraphrased from the official page
//   in its `source`. Don't add advice without a source.
// - Every URL was checked to resolve on 2026-10-24. Re-check before adding.
//   (canada.ca blocks some automated clients; verify those in a browser.)
// - Never add schedules, closures, events or announcements here: link to
//   the authority that publishes them instead.

const GP = 'https://www.canada.ca/en/services/policing/emergencies/preparedness/get-prepared';

const SOURCES = {
  winter:  { label: 'Government of Canada — Winter storms: how to prepare', url: `${GP}/hazards-emergencies/winter-storms/how-prepare.html` },
  heat:    { label: 'Government of Canada — Extreme heat: how to prepare', url: `${GP}/hazards-emergencies/extreme-heat/how-prepare.html` },
  storms:  { label: 'Government of Canada — Thunderstorms: how to prepare', url: `${GP}/hazards-emergencies/thunderstorms/how-prepare.html` },
  floods:  { label: 'Government of Canada — Floods: how to prepare', url: `${GP}/hazards-emergencies/floods/how-prepare.html` },
  smoke:   { label: 'Health Canada — How to prepare for wildfire smoke', url: 'https://www.canada.ca/en/health-canada/services/publications/healthy-living/how-prepare-wildfire-smoke.html' },
  kit:     { label: 'Government of Canada — Emergency kits', url: `${GP}/emergency-kits.html` },
  carKit:  { label: 'Government of Canada — Emergency car kit', url: `${GP}/emergency-kits/car-kit.html` },
  plan:    { label: 'Government of Canada — Make an emergency plan', url: `${GP}/make-plan.html` },
};

// ---- Resource directory ----------------------------------------------------
// id: stable key (the dashboard's local-links strip picks entries by id).
const RESOURCES = [
  { category: 'Emergency', items: [
    { id: 'neepawa-connect', title: 'Neepawa Connect alerts', desc: 'The Town’s emergency notification system — sign up for calls, texts or email.', url: 'https://www.neepawa.ca/connect/', org: 'Town of Neepawa' },
    { id: 'town-emergency', title: 'Town emergency services', desc: 'Fire department, police and emergency contacts for Neepawa.', url: 'https://www.neepawa.ca/services/emergency-services/', org: 'Town of Neepawa' },
    { id: 'town-emergency-guide', title: 'Neepawa emergency guide (2020, PDF)', desc: 'The Town’s printable emergency pamphlet. Published 2020 — confirm contacts with the Town.', url: 'https://www.neepawa.ca/wp-content/uploads/2020/09/Emergency-Pamphlet.pdf', org: 'Town of Neepawa' },
    { id: 'mb-emo', title: 'Manitoba Emergency Management', desc: 'Provincial emergency information and preparedness.', url: 'https://www.gov.mb.ca/emo/', org: 'Province of Manitoba' },
    { id: 'hydro-outages', title: 'Power outage map', desc: 'Current Manitoba Hydro outages and restoration estimates.', url: 'https://www.hydro.mb.ca/outages/', org: 'Manitoba Hydro' },
  ]},
  { category: 'Weather & hazards', items: [
    { id: 'ec-neepawa', title: 'Neepawa forecast & weather alerts', desc: 'Official 7-day forecast and any active warnings for Neepawa.', url: 'https://weather.gc.ca/en/location/index.html?coords=50.229,-99.466', org: 'Environment Canada' },
    { id: 'aqhi', title: 'Air Quality Health Index', desc: 'What AQHI numbers mean and how to protect your health, including from wildfire smoke.', url: 'https://www.canada.ca/en/environment-climate-change/services/air-quality-health-index.html', org: 'Government of Canada' },
    { id: 'mb-wildfire', title: 'Manitoba wildfire information', desc: 'Active fires, fire bans and travel restrictions in Manitoba.', url: 'https://www.gov.mb.ca/wildfire/', org: 'Province of Manitoba' },
    { id: 'cwfis-map', title: 'Wildfire map (satellite)', desc: 'National interactive map of fire detections — the source of CityPulse’s wildfire data.', url: 'https://cwfis.cfs.nrcan.gc.ca/interactive-map', org: 'Natural Resources Canada' },
    { id: 'mb-flood', title: 'Manitoba flood information', desc: 'Official flood forecasts, bulletins and outlooks.', url: 'https://www.manitoba.ca/floodinfo/', org: 'Province of Manitoba' },
    { id: 'whitemud-gauge', title: 'Whitemud River gauge (05LL005)', desc: 'Real-time water level and flow near Keyes — the gauge CityPulse uses.', url: 'https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=05LL005', org: 'Water Survey of Canada' },
  ]},
  { category: 'Roads & travel', items: [
    { id: 'mb511', title: 'Manitoba 511', desc: 'Province-wide road conditions, closures, construction and cameras.', url: 'https://www.manitoba511.ca/', org: 'Province of Manitoba' },
    { id: 'call-511', title: 'Road info by phone: 511', desc: 'Manitoba road information by phone.', url: 'tel:511', org: 'Province of Manitoba' },
    { id: 'snow-clearing', title: 'Neepawa snow clearing', desc: 'How and when town streets are cleared.', url: 'https://www.neepawa.ca/snow-clearing-information/', org: 'Town of Neepawa' },
    { id: 'town-transport', title: 'Local transportation', desc: 'Transportation services in Neepawa.', url: 'https://www.neepawa.ca/services/transportation/', org: 'Town of Neepawa' },
  ]},
  { category: 'Town services', items: [
    { id: 'town-notices', title: 'Town notices', desc: 'Official notices from the Town of Neepawa.', url: 'https://www.neepawa.ca/main-notice/', org: 'Town of Neepawa' },
    { id: 'garbage', title: 'Garbage & recycling', desc: 'Collection information for residents.', url: 'https://www.neepawa.ca/services/garbage-recycling-information/', org: 'Town of Neepawa' },
    { id: 'water', title: 'Water & sewer', desc: 'Water and sewer services and information.', url: 'https://www.neepawa.ca/services/water/', org: 'Town of Neepawa' },
    { id: 'health-care', title: 'Health care in Neepawa', desc: 'Local health services and facilities.', url: 'https://www.neepawa.ca/services/health-care/', org: 'Town of Neepawa' },
    { id: 'town-office', title: 'Town office', desc: 'Hours, location and departments.', url: 'https://www.neepawa.ca/town-office/', org: 'Town of Neepawa' },
    { id: 'town-contacts', title: 'Contact the Town', desc: 'Phone numbers and email for Town departments.', url: 'https://www.neepawa.ca/contact-the-town-of-neepawa/', org: 'Town of Neepawa' },
  ]},
  { category: 'Community', items: [
    { id: 'recreation', title: 'Neepawa Recreation', desc: 'Recreation facilities and programs.', url: 'https://www.neepawarecreation.ca/', org: 'Neepawa Recreation' },
    { id: 'tourism', title: 'Neepawa Tourism', desc: 'Attractions and community events — check here for event dates.', url: 'https://neepawatourism.ca/', org: 'Neepawa Tourism' },
    { id: 'campground', title: 'Riverbend Campground', desc: 'Town campground information.', url: 'https://www.neepawa.ca/riverbend-campground/', org: 'Town of Neepawa' },
  ]},
  { category: 'Preparedness', items: [
    { id: 'gc-kit', title: 'Build an emergency kit', desc: 'What to keep at home to manage for at least 72 hours.', url: SOURCES.kit.url, org: 'Government of Canada' },
    { id: 'gc-car-kit', title: 'Emergency car kit', desc: 'What to keep in your vehicle.', url: SOURCES.carKit.url, org: 'Government of Canada' },
    { id: 'gc-plan', title: 'Make an emergency plan', desc: 'A household plan covering everyone, including pets.', url: SOURCES.plan.url, org: 'Government of Canada' },
  ]},
];

// ---- FAQ ----------------------------------------------------------------------
const FAQ = [
  { q: 'Is CityPulse official?', a: 'No. CityPulse is an independent dashboard and is not affiliated with the Town of Neepawa or any government. It republishes data from official sources and links to them. It is not an emergency service.' },
  { q: 'How current is the information?', a: 'Current weather and air quality are fetched live from Open-Meteo each time the page loads. Alerts, road information, cameras, wildfires and the river gauge come from an automatic update; the page always shows how old that update is, and shows a warning if it is more than 4 hours old.' },
  { q: 'What does “Unconfirmed” or “unavailable” mean?', a: 'A data source didn’t respond, so CityPulse can’t say whether there is anything to report. It never treats a missing source as “all clear”. Check the official source linked in the message.' },
  { q: 'How do I get emergency alerts on my phone?', a: 'Sign up for Neepawa Connect, the Town’s emergency notification system (neepawa.ca/connect). Canada’s national alerting system also sends critical alerts to compatible phones automatically.' },
  { q: 'Where do weather alerts come from?', a: 'Environment Canada. CityPulse reads the alerts for the Brandon forecast region, which covers Neepawa; very localized warnings may only appear on Environment Canada’s Neepawa page.' },
  { q: 'Why are there no highway conditions?', a: 'Manitoba 511 publishes driving-condition reports mainly in winter and during severe weather. Road events (construction, closures) are shown year-round.' },
  { q: 'Why does a camera say “offline”?', a: 'The Manitoba 511 feed for that camera is down. CityPulse hides cameras that are known to be offline and labels any that fail while you’re viewing.' },
  { q: 'What do the air quality numbers mean?', a: 'CityPulse estimates the Air Quality Health Index (AQHI) from modelled pollution: 1–3 low risk, 4–6 moderate, 7–10 high, above 10 very high. The official index uses 3-hour station averages, so treat it as a close estimate.' },
  { q: 'Is wildfire data official?', a: 'It’s satellite heat detection from Natural Resources Canada, not official incident reports. Small or new fires can be missed and industrial heat can occasionally appear. For fire bans and evacuations, see Manitoba’s wildfire page.' },
  { q: 'Does CityPulse collect my data?', a: 'No analytics, ads or tracking. Your theme choice is stored only in your own browser and never sent anywhere.' },
];
