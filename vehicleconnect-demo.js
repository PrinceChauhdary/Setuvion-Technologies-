const examples = {
  motorcycle: {
    name: "Motorcycle · Demo 01", batteryLabel: "BATTERY VOLTAGE", battery: "12.6", unit: "V",
    health: "96% · example", trip: 18.4, coordinates: "SAMPLE ZONE A · NO LIVE GPS",
    speeds: [18, 21, 25, 23, 29, 34, 31, 37, 32, 28, 25, 30, 35, 39, 36, 33, 28, 24, 27, 31, 36, 38, 34, 30],
    trips: [["Morning sample ride", "Today · generated", "8.2 km"], ["Workshop loop", "Yesterday · generated", "5.6 km"], ["Evening sample", "20 Oct · generated", "4.6 km"]],
  },
  car: {
    name: "Passenger car · Demo 02", batteryLabel: "BATTERY VOLTAGE", battery: "12.4", unit: "V",
    health: "92% · example", trip: 42.7, coordinates: "SAMPLE ZONE B · NO LIVE GPS",
    speeds: [0, 0, 8, 18, 31, 42, 39, 47, 53, 48, 59, 64, 61, 55, 68, 72, 65, 57, 51, 44, 49, 58, 63, 60],
    trips: [["Commute sample", "Today · generated", "16.8 km"], ["Test loop", "Yesterday · generated", "12.4 km"], ["Sample journey", "20 Oct · generated", "13.5 km"]],
  },
  ev: {
    name: "Electric vehicle · Demo 03", batteryLabel: "PACK VOLTAGE · EXAMPLE", battery: "392.4", unit: "V",
    health: "94% · example", trip: 126.3, coordinates: "SAMPLE ZONE C · NO LIVE GPS",
    speeds: [12, 16, 23, 30, 37, 45, 52, 48, 56, 62, 59, 66, 71, 68, 61, 55, 49, 43, 47, 54, 60, 64, 58, 51],
    trips: [["Urban sample", "Today · generated", "23.1 km"], ["Charge-point loop", "Yesterday · generated", "41.7 km"], ["Demo journey", "20 Oct · generated", "31.5 km"]],
  },
};

const byId = (id) => document.getElementById(id);
const selector = byId("vehicle-kind");
const speedValue = byId("speed-value");
const chartLine = byId("chart-line");
const chartArea = byId("chart-area");
const chartPoint = byId("chart-point");
const toggleButton = byId("toggle-demo");
const chartStatus = byId("chart-status");
let selected = examples.motorcycle;
let sampleIndex = 0;
let paused = false;
let tripDistance = selected.trip;

function drawChart() {
  const values = Array.from({ length: 24 }, (_, position) => selected.speeds[(sampleIndex + position) % selected.speeds.length]);
  const points = values.map((speed, index) => {
    const x = 48 + (index * 652) / (values.length - 1);
    const y = 190 - (Math.max(0, Math.min(80, speed)) / 80) * 168;
    return [x, y];
  });
  chartLine.setAttribute("points", points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
  const first = points[0];
  const last = points.at(-1);
  chartArea.setAttribute("d", `M ${first[0]} 190 L ${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} L ${last[0]} 190 Z`);
  chartPoint.setAttribute("cx", last[0]);
  chartPoint.setAttribute("cy", last[1]);
  speedValue.textContent = String(values.at(-1));
}

function renderTrips() {
  byId("trip-list").replaceChildren(...selected.trips.map(([title, subtitle, distance]) => {
    const row = document.createElement("div");
    row.className = "vc-trip-row";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const detail = document.createElement("span");
    detail.textContent = subtitle;
    const value = document.createElement("b");
    value.textContent = distance;
    row.append(heading, detail, value);
    return row;
  }));
}

function selectExample(kind) {
  selected = examples[kind] || examples.motorcycle;
  sampleIndex = 0;
  tripDistance = selected.trip;
  byId("selected-vehicle-name").textContent = selected.name;
  byId("battery-label").textContent = selected.batteryLabel;
  byId("battery-value").textContent = selected.battery;
  byId("battery-unit").textContent = selected.unit;
  byId("device-health").textContent = selected.health;
  byId("sample-coordinates").textContent = selected.coordinates;
  byId("trip-distance").textContent = tripDistance.toFixed(1);
  byId("sample-time").textContent = new Date().toLocaleTimeString();
  renderTrips();
  drawChart();
}

selector.addEventListener("change", () => selectExample(selector.value));
toggleButton.addEventListener("click", () => {
  paused = !paused;
  toggleButton.innerHTML = paused ? '<span aria-hidden="true">▶</span> Resume sample' : '<span aria-hidden="true">Ⅱ</span> Pause sample';
  chartStatus.textContent = paused ? "Sample paused" : "Updating sample";
});
byId("reset-demo").addEventListener("click", () => {
  sampleIndex = 0;
  paused = false;
  toggleButton.innerHTML = '<span aria-hidden="true">Ⅱ</span> Pause sample';
  chartStatus.textContent = "Updating sample";
  selectExample(selector.value);
});

selectExample(selector.value);
window.setInterval(() => {
  if (paused) return;
  sampleIndex = (sampleIndex + 1) % selected.speeds.length;
  const latestSpeed = selected.speeds[(sampleIndex + 23) % selected.speeds.length];
  tripDistance += latestSpeed / 22500;
  byId("trip-distance").textContent = tripDistance.toFixed(1);
  byId("sample-time").textContent = new Date().toLocaleTimeString();
  byId("alert-title").textContent = latestSpeed > 55 ? "Higher-speed sample" : "Movement sample detected";
  byId("alert-description").textContent = "Generated event · no security system is connected";
  chartStatus.textContent = "Generated sample updated";
  drawChart();
}, 1400);
