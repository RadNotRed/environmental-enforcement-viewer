import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import us from "us-atlas/states-10m.json";
import world from "world-atlas/countries-110m.json";

type Summary = {
  metadata: { imported_at: string };
  stats: {
    cases: number;
    first_year: number | null;
    last_year: number | null;
    total_fines: number;
    total_restitution: number;
    incarceration_cases: number;
  };
  timeSeries: Array<{ year: number; cases: number }>;
  categoryFlags: Array<{ label: string; cases: number }>;
  topDistricts: Array<{ district_name: string; state: string; circuit: string; cases: number }>;
  circuits: Array<{ circuit: string; cases: number }>;
  sheets: Array<unknown>;
};

type GeoPoint = {
  lat: number;
  lng: number;
  cases: number;
  district_name?: string;
  state?: string;
  circuit?: string;
  country?: string;
  coordinate?: { lat: number; lng: number };
};

type GeoData = {
  districts: GeoPoint[];
  countries: GeoPoint[];
};

type PageName = "atlas" | "cases" | "data";
type MapMode = "both" | "districts" | "countries";
type CanvasPoint = { x: number; y: number };
type HoverPoint = GeoPoint & { x: number; y: number; size: number };

const topo = world as unknown as {
  objects: {
    countries: unknown;
  };
};
const land = feature(topo as never, topo.objects.countries as never) as never;
const borders = mesh(
  topo as never,
  topo.objects.countries as never,
  (a: unknown, b: unknown) => a !== b,
) as never;
const usTopo = us as unknown as {
  objects: {
    states: unknown;
  };
};
const stateBorders = mesh(
  usTopo as never,
  usTopo.objects.states as never,
  (a: unknown, b: unknown) => a !== b,
) as never;
const graticule = geoGraticule10();

const number = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const colors: Record<string, string> = {
  "1": "#26c6da",
  "2": "#5c6bc0",
  "3": "#42a5f5",
  "4": "#ab47bc",
  "5": "#ffca28",
  "6": "#ff7043",
  "7": "#ec407a",
  "8": "#66bb6a",
  "9": "#29b6f6",
  "10": "#7e57c2",
  "11": "#00acc1",
  "12": "#d4e157",
  Unknown: "#90a4ae",
};

const app = {
  summary: null as Summary | null,
  geo: null as GeoData | null,
  mode: "both" as MapMode,
  query: "",
  selectedDistrict: "",
  selectedCircuit: "",
  rotation: 98,
  tilt: -22,
  roll: -8,
  zoom: 1,
  pointer: null as { x: number; y: number } | null,
  dragging: false,
  dragLast: null as { x: number; y: number } | null,
  dragMoved: false,
  suppressClick: false,
  pauseUntil: 0,
  lastFrameAt: 0,
  needsRender: true,
  searchOpen: false,
  page: "atlas" as PageName,
  hover: null as HoverPoint | null,
  lockedHover: null as HoverPoint | null,
  pinchActive: false,
};

function $(selector: string) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing selector: ${selector}`);
  return node as HTMLElement;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRotation(value: number) {
  let next = value;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return next;
}

function movementScale() {
  return 1 / Math.max(1, Math.sqrt(app.zoom));
}

function markRender() {
  app.needsRender = true;
}

function pageFromPath(pathname = window.location.pathname): PageName {
  const page = pathname.replace(/^\/|\/$/g, "");
  return page === "cases" || page === "data" ? page : "atlas";
}

function pagePath(page: PageName) {
  return `/${page}`;
}

function currentSearchParams() {
  const params = new URLSearchParams();
  if (app.query) params.set("q", app.query);
  if (app.selectedDistrict) params.set("district", app.selectedDistrict);
  if (app.selectedCircuit) params.set("circuit", app.selectedCircuit);
  const sort = ($("#sortFilter") as HTMLSelectElement).value;
  if (sort && sort !== "year") params.set("sort", sort);
  return params;
}

function syncUrl(page = app.page, mode: "push" | "replace" = "push") {
  const params = currentSearchParams();
  const query = params.toString();
  const next = `${pagePath(page)}${query ? `?${query}` : ""}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return;
  history[mode === "replace" ? "replaceState" : "pushState"]({ page }, "", next);
}

function applyUrlSearchState() {
  const params = new URLSearchParams(window.location.search);
  app.query = params.get("q")?.trim() ?? "";
  app.selectedDistrict = params.get("district")?.trim() ?? "";
  app.selectedCircuit = params.get("circuit")?.trim() ?? "";

  const searchInput = $("#searchInput") as HTMLInputElement;
  const circuitFilter = $("#circuitFilter") as HTMLSelectElement;
  const sortFilter = $("#sortFilter") as HTMLSelectElement;
  searchInput.value = app.query;
  circuitFilter.value = app.selectedCircuit;

  const sort = params.get("sort")?.trim() ?? "year";
  sortFilter.value = sortFilter.querySelector(`option[value="${CSS.escape(sort)}"]`) ? sort : "year";
}

function cleanLabel(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function districtTooltip(point: GeoPoint) {
  const district = cleanLabel(point.district_name);
  const state = cleanLabel(point.state);
  const circuit = cleanLabel(point.circuit);
  const details = [
    state ? escapeHtml(state) : "",
    circuit ? `Circuit ${escapeHtml(circuit)}` : "",
  ].filter(Boolean);
  return `<div class="tooltip-title">${escapeHtml(district || "Unknown district")}</div>${details.length ? `<div class="tooltip-meta">${details.join(" · ")}</div>` : ""}<div class="tooltip-count">${number.format(point.cases)} cases</div>`;
}

function countryTooltip(point: GeoPoint) {
  return `<div class="tooltip-title">${escapeHtml(cleanLabel(point.country) || "Unknown country")}</div><div class="tooltip-meta">Linked country field</div><div class="tooltip-count">${number.format(point.cases)} mentions</div>`;
}

const canvas = $("#globeCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: true });
const tooltip = $("#globeTooltip");
const globeStage = canvas.closest(".globe-stage") as HTMLElement;
const activePointers = new Map<number, CanvasPoint>();
const pointerStarts = new Map<number, CanvasPoint>();
let pinchStart: { distance: number; zoom: number } | null = null;
let lastTouchAt = 0;
let touchTapStart: CanvasPoint | null = null;
let touchTapValid = false;

if (!ctx) {
  (window as unknown as { __atlasFallbackBoot?: () => void }).__atlasFallbackBoot?.();
  throw new Error("Canvas 2D is unavailable.");
}

const projection = geoOrthographic().clipAngle(90).precision(0.4);
const path = geoPath(projection, ctx);

function lightMode() {
  return document.body.classList.contains("light");
}

function globePalette() {
  if (lightMode()) {
    return {
      oceanStops: ["#dff4ff", "#9dc8e8", "#5f89b7"],
      rimShadow: "rgba(59, 130, 246, 0.3)",
      rimStroke: "rgba(37, 99, 235, 0.32)",
      land: "rgba(65, 95, 128, 0.78)",
      graticule: "rgba(30, 64, 175, 0.16)",
      borders: "rgba(15, 23, 42, 0.22)",
      stateBordersNear: "rgba(245, 158, 11, 0.58)",
      stateBordersFar: "rgba(245, 158, 11, 0.34)",
      haloInner: "rgba(239, 246, 255, 0)",
      haloOuter: "rgba(30, 64, 175, 0.18)",
      orbitA: "#f59e0b",
      orbitB: "#8b5cf6",
      vignetteAlpha: 0.16,
    };
  }

  return {
    oceanStops: ["#273452", "#182235", "#0b1020"],
    rimShadow: "rgba(92, 107, 192, 0.46)",
    rimStroke: "rgba(129, 212, 250, 0.34)",
    land: "rgba(57, 73, 112, 0.86)",
    graticule: "rgba(144, 202, 249, 0.12)",
    borders: "rgba(225, 245, 254, 0.22)",
    stateBordersNear: "rgba(255, 183, 77, 0.44)",
    stateBordersFar: "rgba(255, 183, 77, 0.24)",
    haloInner: "rgba(13, 18, 32, 0)",
    haloOuter: "rgba(6, 8, 18, 0.52)",
    orbitA: "#ffb74d",
    orbitB: "#ab47bc",
    vignetteAlpha: 0.2,
  };
}

function maxCanvasDpr() {
  return 1;
}

function resize() {
  const rect = canvas.parentElement?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, maxCanvasDpr());
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  markRender();
}

function updateProjection() {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width, rect.height) * 0.36 * app.zoom;
  projection
    .scale(scale)
    .translate([rect.width * 0.5, rect.height * 0.53])
    .rotate([app.rotation, app.tilt, app.roll])
    .precision(app.zoom > 12 ? 9 : app.zoom > 8 ? 6 : app.zoom > 4 ? 3 : 1.4);
}

function visible(point: GeoPoint) {
  return geoDistance([point.lng, point.lat], [-app.rotation, -app.tilt]) < Math.PI / 2;
}

function currentPoints() {
  if (!app.geo) return [];
  const rows =
    app.mode === "both"
      ? [
          ...app.geo.districts,
          ...app.geo.countries.filter((row) => row.country !== "United States"),
        ]
      : app.mode === "districts"
        ? app.geo.districts
        : app.geo.countries;
  const max = Math.max(...rows.map((row) => row.cases), 1);
  const zoomScale = app.zoom > 4 ? Math.max(0.48, Math.sqrt(4 / app.zoom)) : 1;
  return rows.map((row) => {
    const coordinate = row.coordinate ?? row;
    const isCountry = Boolean(row.country);
    return {
      ...row,
      lat: coordinate.lat,
      lng: coordinate.lng,
      size: Math.max(2.8, (3.4 + Math.sqrt(row.cases / max) * 15) * zoomScale),
      color:
        !isCountry
          ? colors[row.circuit ?? "Unknown"] ?? "#94a3b8"
          : row.country === "United States"
            ? "#26c6da"
            : "#ffb74d",
    };
  });
}

function drawSphere(rect: DOMRect) {
  const palette = globePalette();
  const cx = rect.width * 0.5;
  const cy = rect.height * 0.53;
  const radius = projection.scale();
  const body = ctx.createRadialGradient(
    cx - radius * 0.36,
    cy - radius * 0.42,
    radius * 0.08,
    cx,
    cy,
    radius,
  );
  body.addColorStop(0, palette.oceanStops[0]);
  body.addColorStop(0.52, palette.oceanStops[1]);
  body.addColorStop(1, palette.oceanStops[2]);

  ctx.fillStyle = body;
  if (radius > Math.max(rect.width, rect.height) * 1.12) {
    ctx.fillRect(0, 0, rect.width, rect.height);
    return;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = palette.rimShadow;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = palette.rimStroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawWorld() {
  const palette = globePalette();
  ctx.save();
  ctx.beginPath();
  path({ type: "Sphere" } as never);
  ctx.clip();

  ctx.beginPath();
  path(land);
  ctx.fillStyle = palette.land;
  ctx.fill();

  ctx.beginPath();
  path(graticule as never);
  ctx.strokeStyle = palette.graticule;
  ctx.lineWidth = 0.7;
  ctx.stroke();

  ctx.beginPath();
  path(borders);
  ctx.strokeStyle = palette.borders;
  ctx.lineWidth = 0.55;
  ctx.stroke();

  if (app.zoom >= 1.28) {
    ctx.beginPath();
    path(stateBorders);
    ctx.strokeStyle = app.zoom > 2.2 ? palette.stateBordersNear : palette.stateBordersFar;
    ctx.lineWidth = app.zoom > 3.2 ? 1 : 0.62;
    ctx.stroke();
  }

  ctx.restore();
}

function drawMarkers() {
  const points = currentPoints()
    .filter(visible)
    .map((point) => {
      const projected = projection([point.lng, point.lat]);
      return projected ? { ...point, x: projected[0], y: projected[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.size - b!.size) as Array<GeoPoint & { color: string; size: number; x: number; y: number }>;

  app.hover = app.lockedHover;
  for (const point of points) {
    const near =
      app.pointer &&
      Math.hypot(app.pointer.x - point.x, app.pointer.y - point.y) <= point.size + 7;
    if (near) app.hover = point;
    const locked =
      app.lockedHover &&
      app.lockedHover.district_name === point.district_name &&
      app.lockedHover.country === point.country &&
      app.lockedHover.circuit === point.circuit;

    ctx.save();
    ctx.globalAlpha = near || locked ? 0.42 : 0.2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.size * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = point.color;
    ctx.fill();
    ctx.globalAlpha = locked ? 1 : 0.92;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
    ctx.fillStyle = point.color;
    ctx.fill();
    ctx.restore();
  }
}

function drawVignette(rect: DOMRect) {
  const palette = globePalette();
  const cx = rect.width * 0.5;
  const cy = rect.height * 0.53;
  const radius = projection.scale();
  ctx.save();
  if (app.zoom < 5) {
    ctx.globalAlpha = palette.vignetteAlpha;
    ctx.strokeStyle = palette.orbitA;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.08, Math.PI * 0.08, Math.PI * 0.43);
    ctx.stroke();
    ctx.globalAlpha = lightMode() ? 0.14 : 0.16;
    ctx.strokeStyle = palette.orbitB;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.16, Math.PI * 1.12, Math.PI * 1.62);
    ctx.stroke();
  }
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.64, cx, cy, radius * 1.22);
  halo.addColorStop(0, palette.haloInner);
  halo.addColorStop(1, palette.haloOuter);
  ctx.globalAlpha = 1;
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.restore();
}

function draw(timestamp = 0) {
  const minFrameMs = app.dragging ? 24 : 33;
  if (timestamp && timestamp - app.lastFrameAt < minFrameMs) {
    requestAnimationFrame(draw);
    return;
  }
  const shouldAutoRotate = app.page === "atlas" && !app.dragging && Date.now() > app.pauseUntil;
  if (!app.needsRender && !shouldAutoRotate) {
    requestAnimationFrame(draw);
    return;
  }
  app.lastFrameAt = timestamp;
  if (shouldAutoRotate) {
    app.rotation = normalizeRotation(app.rotation + 0.045 * movementScale());
  }
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  updateProjection();
  drawSphere(rect);
  drawWorld();
  drawMarkers();
  drawVignette(rect);
  app.needsRender = false;
  updateTooltip();
  requestAnimationFrame(draw);
}

function updateTooltip() {
  if (!app.hover || (!app.pointer && !app.lockedHover) || (app.dragging && !app.lockedHover)) {
    tooltip.hidden = true;
    tooltip.innerHTML = "";
    return;
  }
  const anchor = app.lockedHover ?? app.pointer!;
  tooltip.hidden = false;
  tooltip.style.left = `${anchor.x + 14}px`;
  tooltip.style.top = `${anchor.y + 14}px`;
  tooltip.innerHTML = app.hover.country && !app.hover.district_name ? countryTooltip(app.hover) : districtTooltip(app.hover);
}

function clearMapHover() {
  app.hover = null;
  app.lockedHover = null;
  app.pointer = null;
  tooltip.hidden = true;
  tooltip.innerHTML = "";
  markRender();
}

function canvasPoint(event: PointerEvent): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function clientPoint(clientX: number, clientY: number): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function pointerDistance(points = [...activePointers.values()]) {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function hideMapTooltip() {
  app.hover = null;
  app.lockedHover = null;
  tooltip.hidden = true;
  tooltip.innerHTML = "";
  markRender();
}

function startPinchGesture() {
  const distance = pointerDistance();
  pinchStart = distance > 0 ? { distance, zoom: app.zoom } : null;
  app.pinchActive = true;
  app.dragLast = null;
  hideMapTooltip();
}

function findPointAt(pointer: CanvasPoint) {
  return currentPoints()
    .filter(visible)
    .map((point) => {
      const projected = projection([point.lng, point.lat]);
      return projected ? { ...point, x: projected[0], y: projected[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b!.size - a!.size)
    .find((point) => {
      const hitRadius = Math.max(24, point!.size * 2.7 + 8);
      return Math.hypot(pointer.x - point!.x, pointer.y - point!.y) <= hitRadius;
    }) as
    | HoverPoint
    | undefined;
}

function sameMapPoint(a: HoverPoint | null, b: HoverPoint | null | undefined) {
  if (!a || !b) return false;
  return a.district_name === b.district_name && a.country === b.country && a.circuit === b.circuit;
}

function toggleLockedPointAt(pointer: CanvasPoint) {
  lastTouchAt = Date.now();
  updateProjection();
  const tapped = findPointAt(pointer);
  if (sameMapPoint(app.lockedHover, tapped)) {
    clearMapHover();
  } else if (tapped) {
    app.lockedHover = tapped;
    app.hover = tapped;
    app.pointer = null;
    tooltip.hidden = false;
    tooltip.style.left = `${tapped.x + 14}px`;
    tooltip.style.top = `${tapped.y + 14}px`;
    tooltip.innerHTML = tapped.country && !tapped.district_name ? countryTooltip(tapped) : districtTooltip(tapped);
    markRender();
  } else {
    clearMapHover();
  }
  app.suppressClick = true;
  window.setTimeout(() => {
    app.suppressClick = false;
  }, 0);
}

function renderSummary() {
  if (!app.summary) return;
  const { stats, metadata, sheets, timeSeries, categoryFlags, topDistricts, circuits } = app.summary;
  $("#caseCount").textContent = number.format(stats.cases);
  $("#fineTotal").textContent = money.format(stats.total_fines);
  $("#restitutionTotal").textContent = money.format(stats.total_restitution);
  $("#incarcerationCount").textContent = number.format(stats.incarceration_cases);
  $("#yearRange").textContent = `${stats.first_year ?? "?"} to ${stats.last_year ?? "?"}`;
  $("#metaGrid").innerHTML = `
    <div><dt>Cases</dt><dd>${number.format(stats.cases)}</dd></div>
    <div><dt>Years</dt><dd>${stats.first_year ?? "?"}-${stats.last_year ?? "?"}</dd></div>
    <div><dt>Sheets</dt><dd>${sheets.length}</dd></div>
    <div><dt>Imported</dt><dd>${new Date(metadata.imported_at).toLocaleDateString()}</dd></div>
  `;

  const select = $("#circuitFilter") as HTMLSelectElement;
  select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
  for (const row of circuits) {
    const option = document.createElement("option");
    option.value = row.circuit;
    option.textContent = `Circuit ${row.circuit} · ${number.format(row.cases)}`;
    select.append(option);
  }

  const maxYear = Math.max(...timeSeries.map((row) => row.cases), 1);
  const timelineColors = ["#42a5f5", "#26c6da", "#ffb74d", "#ab47bc", "#ec407a", "#66bb6a", "#7e57c2", "#d4e157"];
  $("#timeline").innerHTML = timeSeries
    .map(
      (row, index) =>
        `<button type="button" style="--h:${Math.max(18, Math.round((row.cases / maxYear) * 136))}px;--bar:${timelineColors[index % timelineColors.length]}" title="${row.year}: ${number.format(row.cases)} cases"><em>${number.format(row.cases)}</em><span></span><small>${row.year}</small></button>`,
    )
    .join("");

  const maxFlag = Math.max(...categoryFlags.map((row) => row.cases), 1);
  const barColors = timelineColors;
  $("#categoryBars").innerHTML = categoryFlags
    .map(
      (row, index) =>
        `<div class="bar-row" style="--bar:${barColors[index % barColors.length]}"><span>${escapeHtml(row.label)}</span><div><i style="width:${(row.cases / maxFlag) * 100}%"></i></div><b>${number.format(row.cases)}</b></div>`,
    )
    .join("");

  $("#districtList").innerHTML = topDistricts
    .map(
      (row) =>
        `<button type="button" data-district="${escapeHtml(row.district_name)}"><span><b>${escapeHtml(row.district_name)}</b><small>${escapeHtml(row.state)} · Circuit ${escapeHtml(row.circuit)}</small></span><strong>${number.format(row.cases)}</strong></button>`,
    )
    .join("");
  $("#districtList")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        app.selectedDistrict = button.dataset.district ?? "";
        app.query = "";
        ($("#searchInput") as HTMLInputElement).value = "";
        setPage("cases");
        loadSearch();
      });
    });
}

function caseCard(row: Record<string, any>) {
  const category =
    row.category_harmonized ||
    row.category_collapsed ||
    row.category_group ||
    row.species_category ||
    "Uncategorized";
  const penalties = [
    row.fine ? `${money.format(row.fine)} fine` : null,
    row.restitution ? `${money.format(row.restitution)} restitution` : null,
    row.jail_prison_months ? `${number.format(row.jail_prison_months)} prison months` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const speciesLine = formatSpeciesInfo(row);
  return `<article class="case-card">
    <div>
      <h3>${escapeHtml(row.case_id || row.base_id || "Unnamed case")}</h3>
      <p>${escapeHtml(row.district_name || "Unknown district")}${row.state ? `, ${escapeHtml(row.state)}` : ""} · ${escapeHtml(row.year || "No year")} · Circuit ${escapeHtml(row.circuit || "?")}</p>
    </div>
    <div class="case-tags">
      <span>${escapeHtml(category)}</span>
      ${row.species_category ? `<span>${escapeHtml(row.species_category)}</span>` : ""}
      ${row.country_primary ? `<span>${escapeHtml(row.country_primary)}</span>` : ""}
      ${penalties ? `<span>${escapeHtml(penalties)}</span>` : ""}
    </div>
    ${speciesLine}
    <p class="charges">${row.charge_snippet || escapeHtml(row.charges || "No charge text available.")}</p>
  </article>`;
}

function searchTitle() {
  return app.query ? `Search results for "${app.query}"` : app.selectedDistrict || "Recent cases";
}

function setSearchPopover(open: boolean) {
  app.searchOpen = open;
  $("#searchPopover").hidden = !open;
}

function openSearchPopover() {
  setSearchPopover(true);
}

function setFilterDropdown(open: boolean) {
  const toggle = $("#filterToggle") as HTMLButtonElement;
  const menu = $("#caseFilters");
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
}

function setPage(page: PageName, options: { push?: boolean; replace?: boolean; focusSearch?: boolean } = {}) {
  app.page = page;
  document.body.dataset.page = page;
  clearMapHover();
  markRender();
  document.querySelectorAll<HTMLButtonElement>("[data-jump]").forEach((button) => {
    const active = button.dataset.jump === page;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  setSearchPopover(false);
  if (options.push !== false) syncUrl(page, options.replace ? "replace" : "push");
  if (page === "atlas") resize();
  if (options.focusSearch) ($("#searchInput") as HTMLInputElement).focus();
}

function updateFullscreenButton() {
  const button = $("#globeFullscreen") as HTMLButtonElement;
  const active = document.fullscreenElement === globeStage;
  button.setAttribute("aria-pressed", String(active));
  button.title = active ? "Exit fullscreen" : "Fullscreen globe";
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("is-fullscreen", active);
}

async function toggleGlobeFullscreen() {
  try {
    if (document.fullscreenElement === globeStage) {
      await document.exitFullscreen();
    } else {
      await globeStage.requestFullscreen();
    }
  } finally {
    updateFullscreenButton();
    window.setTimeout(resize, 80);
    markRender();
  }
}

function formatSpeciesInfo(row: Record<string, any>) {
  const names = String(row.species_names ?? "").trim();
  const category = String(row.species_category ?? "").trim();
  const parts: string[] = [];
  if (names) parts.push(escapeHtml(names));
  if (category) {
    const label = /^[\d,\s]+$/.test(category) ? `Species category code: ${category}` : `Type: ${category}`;
    parts.push(escapeHtml(label));
  }
  return parts.length ? `<p class="species-line"><b>Animal/species:</b> ${parts.join(" · ")}</p>` : "";
}

async function loadSearch() {
  const params = new URLSearchParams();
  if (app.query) params.set("q", app.query);
  if (app.selectedDistrict) params.set("district", app.selectedDistrict);
  if (app.selectedCircuit) params.set("circuit", app.selectedCircuit);
  params.set("sort", ($("#sortFilter") as HTMLSelectElement).value);
  const data = await fetch(`/api/search?${params}`).then((response) => response.json());
  const title = searchTitle();
  const count = `${number.format(data.total)} matches`;
  const html = data.rows.length
    ? data.rows.map(caseCard).join("")
    : `<div class="empty">No matching cases found.</div>`;
  $("#resultsTitle").textContent = title;
  $("#resultCount").textContent = count;
  $("#results").innerHTML = html;
  $("#searchOverlayTitle").textContent = title;
  $("#searchOverlayCount").textContent = count;
  $("#searchOverlayResults").innerHTML = html;
}

function bindControls() {
  let searchTimer: number | undefined;
  const searchInput = $("#searchInput") as HTMLInputElement;
  searchInput.addEventListener("input", (event) => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      app.query = (event.target as HTMLInputElement).value.trim();
      app.selectedDistrict = "";
      if (app.query) {
        setPage("cases", { replace: app.page === "cases" });
      } else {
        syncUrl(app.page, "replace");
      }
      loadSearch();
    }, 140);
  });
  $("#searchClose").addEventListener("click", () => setSearchPopover(false));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSearchPopover(false);
      setFilterDropdown(false);
    }
  });

  $("#filterToggle").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("#caseFilters");
    setFilterDropdown(menu.hidden);
  });
  document.addEventListener("click", (event) => {
    const target = event.target as Node;
    const filterMenu = $(".filter-menu");
    if (!filterMenu.contains(target)) setFilterDropdown(false);
  });

  $("#circuitFilter").addEventListener("change", (event) => {
    app.selectedCircuit = (event.target as HTMLSelectElement).value;
    app.selectedDistrict = "";
    setPage("cases");
    loadSearch();
    setFilterDropdown(false);
  });
  $("#sortFilter").addEventListener("change", () => {
    setPage("cases");
    loadSearch();
    setFilterDropdown(false);
  });
  $("#themeToggle").addEventListener("click", () => {
    const enabled = document.body.classList.toggle("light");
    document.documentElement.classList.toggle("light", enabled);
    markRender();
  });
  $("#globeFullscreen").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleGlobeFullscreen();
  });
  document.addEventListener("fullscreenchange", () => {
    updateFullscreenButton();
    resize();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-mode]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      app.mode =
        button.dataset.mode === "countries"
          ? "countries"
          : button.dataset.mode === "districts"
            ? "districts"
            : "both";
      clearMapHover();
      markRender();
      $("#geoCount").textContent = `${number.format(currentPoints().length)} mapped ${
        app.mode === "both" ? "districts + countries" : app.mode
      }`;
      $("#mapTitle").textContent =
        app.mode === "both"
          ? "District and country density"
          : app.mode === "districts"
            ? "District and circuit density"
            : "Country involvement";
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.jump === "cases" || button.dataset.jump === "data" ? button.dataset.jump : "atlas";
      setPage(target, { focusSearch: target === "cases" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (target === "cases") loadSearch();
    });
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") event.preventDefault();
    const pointer = canvasPoint(event);
    activePointers.set(event.pointerId, pointer);
    pointerStarts.set(event.pointerId, pointer);
    app.pointer = activePointers.size === 1 ? pointer : null;
    app.dragging = true;
    app.dragLast = activePointers.size === 1 ? pointer : null;
    app.dragMoved = false;
    app.pauseUntil = Date.now() + 30_000;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
    if (activePointers.size >= 2) startPinchGesture();
    markRender();
  });

  canvas.addEventListener("pointermove", (event) => {
    const pointer = canvasPoint(event);

    if (!activePointers.has(event.pointerId)) {
      app.pointer = pointer;
      if (
        app.hover &&
        Math.hypot(pointer.x - app.hover.x, pointer.y - app.hover.y) > app.hover.size + 7
      ) {
        hideMapTooltip();
      }
      markRender();
      return;
    }

    if (event.pointerType === "touch") event.preventDefault();
    activePointers.set(event.pointerId, pointer);
    app.pauseUntil = Date.now() + 30_000;
    markRender();

    if (activePointers.size >= 2) {
      const distance = pointerDistance();
      if (!pinchStart) startPinchGesture();
      if (pinchStart && distance > 0) {
        const rawRatio = distance / pinchStart.distance;
        const ratio = clamp(rawRatio, 0.88, 1.12);
        const nextZoom = clamp(pinchStart.zoom * ratio, 0.72, 20);
        if (Math.abs(nextZoom - app.zoom) > 0.01) {
          app.zoom = nextZoom;
          pinchStart = { distance, zoom: app.zoom };
          app.dragMoved = true;
          markRender();
        }
      }
      app.pointer = null;
      hideMapTooltip();
      return;
    }

    app.pointer = pointer;
    if (app.pinchActive) {
      hideMapTooltip();
      return;
    }
    if (app.dragLast) {
      const dx = pointer.x - app.dragLast.x;
      const dy = pointer.y - app.dragLast.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) {
        const scale = movementScale();
        app.rotation = normalizeRotation(app.rotation + dx * 0.25 * scale);
        app.tilt = clamp(app.tilt - dy * 0.18 * scale, -70, 70);
        app.dragMoved = true;
        hideMapTooltip();
        markRender();
      }
      app.dragLast = pointer;
    }
  });

  const finishPointer = (event: PointerEvent, clear = false) => {
    const releasedPointer = activePointers.get(event.pointerId) ?? canvasPoint(event);
    const startPointer = pointerStarts.get(event.pointerId) ?? releasedPointer;
    const wasTouch = event.pointerType === "touch";
    const touchTravel = Math.hypot(releasedPointer.x - startPointer.x, releasedPointer.y - startPointer.y);
    const wasTap = wasTouch && !app.pinchActive && activePointers.size === 1 && touchTravel <= 14;
    activePointers.delete(event.pointerId);
    pointerStarts.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

    if (activePointers.size >= 2) {
      startPinchGesture();
      return;
    }

    if (activePointers.size === 1) {
      const remaining = [...activePointers.values()][0];
      app.pointer = app.pinchActive ? null : remaining;
      app.dragLast = app.pinchActive ? null : remaining;
      pinchStart = null;
      return;
    }

    app.dragging = false;
    app.dragLast = null;
    pinchStart = null;
    app.pauseUntil = Date.now() + 30_000;
    markRender();
    canvas.classList.remove("is-dragging");

    if (wasTap) {
      toggleLockedPointAt(releasedPointer);
      return;
    }

    const endedPinch = app.pinchActive;
    app.pinchActive = false;
    if (app.dragMoved) {
      app.suppressClick = true;
      window.setTimeout(() => {
        app.suppressClick = false;
      }, 0);
    }
    if (clear || app.dragMoved || endedPinch) clearMapHover();
  };

  canvas.addEventListener("pointerup", (event) => finishPointer(event));
  canvas.addEventListener("pointercancel", (event) => finishPointer(event, true));
  canvas.addEventListener("lostpointercapture", (event) => finishPointer(event as PointerEvent, true));
  canvas.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchTapStart = clientPoint(touch.clientX, touch.clientY);
        touchTapValid = true;
      } else {
        touchTapStart = null;
        touchTapValid = false;
      }
    },
    { passive: true },
  );
  canvas.addEventListener(
    "touchmove",
    (event) => {
      if (!touchTapStart || event.touches.length !== 1) {
        touchTapValid = false;
        return;
      }
      const touch = event.touches[0];
      const point = clientPoint(touch.clientX, touch.clientY);
      if (Math.hypot(point.x - touchTapStart.x, point.y - touchTapStart.y) > 16) {
        touchTapValid = false;
      }
    },
    { passive: true },
  );
  canvas.addEventListener(
    "touchend",
    (event) => {
      if (!touchTapStart || !touchTapValid || event.touches.length !== 0 || event.changedTouches.length < 1) {
        touchTapStart = null;
        touchTapValid = false;
        return;
      }
      event.preventDefault();
      const touch = event.changedTouches[0];
      const point = clientPoint(touch.clientX, touch.clientY);
      if (Math.hypot(point.x - touchTapStart.x, point.y - touchTapStart.y) <= 16) {
        toggleLockedPointAt(point);
      }
      touchTapStart = null;
      touchTapValid = false;
    },
    { passive: false },
  );
  canvas.addEventListener("pointerleave", () => {
    if (!app.dragging) clearMapHover();
  });
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  canvas.addEventListener("click", () => {
    if (Date.now() - lastTouchAt < 700) return;
    if (app.suppressClick) return;
    if (app.hover?.district_name) {
      app.selectedDistrict = app.hover.district_name;
      app.query = "";
      ($("#searchInput") as HTMLInputElement).value = "";
      setPage("cases");
      loadSearch();
    }
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const step = app.zoom >= 12 ? 1 : app.zoom >= 8 ? 0.7 : app.zoom >= 5 ? 0.52 : app.zoom >= 2 ? 0.3 : 0.14;
      app.zoom = Math.min(20, Math.max(0.72, app.zoom + direction * step));
      app.pauseUntil = Date.now() + 30_000;
      markRender();
    },
    { passive: false },
  );
  window.addEventListener("resize", resize);
  window.addEventListener("popstate", () => {
    applyUrlSearchState();
    setPage(pageFromPath(), { push: false });
    loadSearch();
  });
}

async function boot() {
  const [summary, geo] = await Promise.all([
    fetch("/api/summary").then((response) => response.json()),
    fetch("/api/geo").then((response) => response.json()),
  ]);
  app.summary = summary;
  app.geo = geo;
  renderSummary();
  applyUrlSearchState();
  $("#geoCount").textContent = `${number.format(currentPoints().length)} mapped districts + countries`;
  $("#mapTitle").textContent = "District and country density";
  bindControls();
  setPage(pageFromPath(), { push: false });
  resize();
  draw();
  loadSearch();
}

boot().catch((error) => {
  console.error(error);
  (window as unknown as { __atlasFallbackBoot?: () => void }).__atlasFallbackBoot?.();
});
