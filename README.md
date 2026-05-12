<div align="center">

# Environmental Enforcement Atlas

<p>
  <strong>A colorful SQLite-backed Astro atlas for exploring environmental enforcement cases.</strong>
</p>

<p>
  <img alt="Astro" src="https://img.shields.io/badge/Astro-6.3-ff5d01?style=for-the-badge&logo=astro&logoColor=white">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-runtime-14151a?style=for-the-badge&logo=bun&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-case_data-2f80ed?style=for-the-badge&logo=sqlite&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-ui_+_api-3178c6?style=for-the-badge&logo=typescript&logoColor=white">
</p>

<p>
  <span style="color:#42a5f5">Atlas</span> ·
  <span style="color:#ab47bc">Cases</span> ·
  <span style="color:#ffb74d">Districts</span> ·
  <span style="color:#26c6da">Countries</span> ·
  <span style="color:#66bb6a">SQLite Search</span>
</p>

</div>

---

## What This Is

Environmental Enforcement Atlas turns the workbook at:

```text
C:\Users\rad\Downloads\Completed Database with Missing Cases Listed.xlsx
```

into a local SQLite database and an interactive web app for exploring case geography, court districts, countries, penalties, incarceration, species, and notes.

The experience is built around a rotating globe, fast case search, filterable data views, and deep links between atlas, case, and data pages.

## Highlights

<table>
  <tr>
    <td><strong>Interactive Globe</strong></td>
    <td>Animated orthographic map with district bubbles, country mode, drag, zoom, fullscreen, and light/dark globe skins.</td>
  </tr>
  <tr>
    <td><strong>Case Search</strong></td>
    <td>Search charges, districts, countries, animals/species, notes, case IDs, and imported fields.</td>
  </tr>
  <tr>
    <td><strong>SQLite Import</strong></td>
    <td>Imports the Excel workbook into <code>data/environmental_cases.sqlite</code> with registry metadata.</td>
  </tr>
  <tr>
    <td><strong>Deep Links</strong></td>
    <td>Share URLs with search queries, circuit filters, district filters, and sort choices.</td>
  </tr>
  <tr>
    <td><strong>Material-Inspired UI</strong></td>
    <td>Responsive cards, colorful accents, light/dark mode, readable tooltips, and data-first panels.</td>
  </tr>
</table>

## Stack

```text
Astro + TypeScript
Bun runtime and scripts
SQLite via better-sqlite3 and bun:sqlite
d3-geo + topojson-client
world-atlas + us-atlas
Lucide icons
XLSX workbook import
```

## Quick Start

Install dependencies:

```powershell
bun install
```

Import the workbook into SQLite:

```powershell
bun run import:data
```

Start the local dev server:

```powershell
bun run dev -- --port 4321
```

Open:

```text
http://127.0.0.1:4321/
```

## App Routes

| Route | Purpose |
| --- | --- |
| `/atlas` | Globe-first dashboard with metrics, timeline, top districts, and map interactions. |
| `/cases` | Search and browse cases with filters and dynamic query params. |
| `/data` | Workbook metadata, filters, category breakdowns, and imported data context. |
| `/` | Defaults into the atlas experience. |

## Data Flow

```text
Excel workbook
      |
      v
scripts/import-xlsx.ts
      |
      v
data/environmental_cases.sqlite
      |
      v
Astro API routes
      |
      v
Interactive atlas UI
```

## Useful Commands

| Command | What it does |
| --- | --- |
| `bun run import:data` | Re-imports the Excel workbook into SQLite. |
| `bun run dev -- --port 4321` | Runs the local Astro development server. |
| `bun run build` | Builds the server output into `dist/`. |
| `bun run preview -- --port 4321` | Previews the production build locally. |

## Project Layout

```text
data/
  environmental_cases.sqlite

scripts/
  import-xlsx.ts

src/
  lib/
    db.ts
    geo.ts
  pages/
    api/
      geo.ts
      search.ts
      summary.ts
    atlas.astro
    cases.astro
    data.astro
    index.astro
  scripts/
    atlas.ts
```

## Search URL Examples

```text
/cases?q=eagle
/cases?circuit=5
/cases?district=Eastern%20District%20of%20Louisiana
/cases?q=turtle&sort=fine
```

## Design Notes

The visual theme uses a restrained material-style base with bright environmental accents:

<p>
  <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#42a5f5"></span>
  blue for geography and primary actions
  <br>
  <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#66bb6a"></span>
  green for environmental context
  <br>
  <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#ffb74d"></span>
  amber for highlights and district emphasis
  <br>
  <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#ab47bc"></span>
  purple for secondary accents and contrast
</p>

## Notes

- The app expects the source workbook to exist at the path listed above.
- The SQLite database is generated locally and can be refreshed at any time with `bun run import:data`.
- The globe supports both Chromium and Gecko-style browser behavior through standard canvas and pointer APIs.
- If the build prints Astro `Complete!` and then PowerShell appears to hang, the build itself has still completed successfully.

