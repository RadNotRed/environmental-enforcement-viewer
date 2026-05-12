import type { APIRoute } from "astro";
import { all } from "../../lib/db";
import { countryCenters, districtCoordinate, splitCountries } from "../../lib/geo";

export const prerender = false;

export const GET: APIRoute = async () => {
  const districtRows = all<{
    district_name: string;
    state: string;
    circuit: string | number | null;
    cases: number;
    fines: number;
    restitution: number;
    incarceration_months: number;
  }>(`
    SELECT
      district_name,
      state,
      (
        SELECT CASE
          WHEN c2.circuit IS NULL THEN 'Unknown'
          WHEN c2.circuit = CAST(c2.circuit AS INTEGER) THEN CAST(CAST(c2.circuit AS INTEGER) AS TEXT)
          ELSE CAST(c2.circuit AS TEXT)
        END
        FROM cases c2
        WHERE c2.district_name = cases.district_name
          AND COALESCE(c2.state, '') = COALESCE(cases.state, '')
        GROUP BY c2.circuit
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS circuit,
      COUNT(*) AS cases,
      COALESCE(SUM(fine), 0) AS fines,
      COALESCE(SUM(restitution), 0) AS restitution,
      COALESCE(SUM(jail_prison_months), 0) AS incarceration_months
    FROM cases
    WHERE district_name IS NOT NULL
    GROUP BY district_name, state
  `);

  const districts = districtRows
    .map((row) => ({
      ...row,
      circuit: row.circuit == null ? "Unknown" : String(row.circuit),
      coordinate: districtCoordinate(row.state, row.district_name),
    }))
    .filter((row) => row.coordinate);

  const countryRows = all<{
    country_primary: string | null;
    country_detail: string | null;
    cases: number;
  }>(`
    SELECT country_primary, country_detail, COUNT(*) AS cases
    FROM cases
    WHERE country_primary IS NOT NULL OR country_detail IS NOT NULL
    GROUP BY country_primary, country_detail
  `);

  const countryMap = new Map<string, { country: string; cases: number; lat: number; lng: number }>();
  for (const row of countryRows) {
    const names = [
      ...(row.country_primary ? [row.country_primary] : []),
      ...splitCountries(row.country_detail),
    ];
    for (const name of names) {
      const normalized =
        name === "U.S." || name === "US" || name === "U.S" ? "United States" : name;
      const coordinate = countryCenters[normalized] ?? countryCenters[name];
      if (!coordinate) continue;
      const current = countryMap.get(normalized) ?? {
        country: normalized,
        cases: 0,
        ...coordinate,
      };
      current.cases += row.cases;
      countryMap.set(normalized, current);
    }
  }

  const countries = [...countryMap.values()].sort((a, b) => b.cases - a.cases);

  return new Response(JSON.stringify({ districts, countries }), {
    headers: { "content-type": "application/json" },
  });
};
