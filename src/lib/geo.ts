type Coordinate = { lat: number; lng: number };

export const circuitColors: Record<string, string> = {
  "1": "#4ade80",
  "2": "#22d3ee",
  "3": "#60a5fa",
  "4": "#a78bfa",
  "5": "#facc15",
  "6": "#fb923c",
  "7": "#f472b6",
  "8": "#34d399",
  "9": "#38bdf8",
  "10": "#818cf8",
  "11": "#2dd4bf",
  "12": "#bef264",
  dc: "#f0abfc",
  federal: "#cbd5e1",
};

export const stateCenters: Record<string, Coordinate> = {
  Alabama: { lat: 32.8067, lng: -86.7911 },
  Alaska: { lat: 61.3707, lng: -152.4044 },
  Arizona: { lat: 33.7298, lng: -111.4312 },
  Arkansas: { lat: 34.9697, lng: -92.3731 },
  California: { lat: 36.1162, lng: -119.6816 },
  Colorado: { lat: 39.0598, lng: -105.3111 },
  Connecticut: { lat: 41.5978, lng: -72.7554 },
  Delaware: { lat: 39.3185, lng: -75.5071 },
  Florida: { lat: 27.7663, lng: -81.6868 },
  Georgia: { lat: 33.0406, lng: -83.6431 },
  Hawaii: { lat: 21.0943, lng: -157.4983 },
  Idaho: { lat: 44.2405, lng: -114.4788 },
  Illinois: { lat: 40.3495, lng: -88.9861 },
  Indiana: { lat: 39.8494, lng: -86.2583 },
  Iowa: { lat: 42.0115, lng: -93.2105 },
  Kansas: { lat: 38.5266, lng: -96.7265 },
  Kentucky: { lat: 37.6681, lng: -84.6701 },
  Louisiana: { lat: 31.1695, lng: -91.8678 },
  Maine: { lat: 44.6939, lng: -69.3819 },
  Maryland: { lat: 39.0639, lng: -76.8021 },
  Massachusetts: { lat: 42.2302, lng: -71.5301 },
  Michigan: { lat: 43.3266, lng: -84.5361 },
  Minnesota: { lat: 45.6945, lng: -93.9002 },
  Mississippi: { lat: 32.7416, lng: -89.6787 },
  Missouri: { lat: 38.4561, lng: -92.2884 },
  Montana: { lat: 46.9219, lng: -110.4544 },
  Nebraska: { lat: 41.1254, lng: -98.2681 },
  Nevada: { lat: 38.3135, lng: -117.0554 },
  "New Hampshire": { lat: 43.4525, lng: -71.5639 },
  "New Jersey": { lat: 40.2989, lng: -74.521 },
  "New Mexico": { lat: 34.8405, lng: -106.2485 },
  "New York": { lat: 42.1657, lng: -74.9481 },
  "North Carolina": { lat: 35.6301, lng: -79.8064 },
  "North Dakota": { lat: 47.5289, lng: -99.784 },
  Ohio: { lat: 40.3888, lng: -82.7649 },
  Oklahoma: { lat: 35.5653, lng: -96.9289 },
  Oregon: { lat: 44.572, lng: -122.0709 },
  Pennsylvania: { lat: 40.5908, lng: -77.2098 },
  "Rhode Island": { lat: 41.6809, lng: -71.5118 },
  "South Carolina": { lat: 33.8569, lng: -80.945 },
  "South Dakota": { lat: 44.2998, lng: -99.4388 },
  Tennessee: { lat: 35.7478, lng: -86.6923 },
  Texas: { lat: 31.0545, lng: -97.5635 },
  Utah: { lat: 40.15, lng: -111.8624 },
  Vermont: { lat: 44.0459, lng: -72.7107 },
  Virginia: { lat: 37.7693, lng: -78.17 },
  Washington: { lat: 47.4009, lng: -121.4905 },
  "West Virginia": { lat: 38.4912, lng: -80.9545 },
  Wisconsin: { lat: 44.2685, lng: -89.6165 },
  Wyoming: { lat: 42.756, lng: -107.3025 },
  "District of Columbia": { lat: 38.9072, lng: -77.0369 },
  "Puerto Rico": { lat: 18.2208, lng: -66.5901 },
  Guam: { lat: 13.4443, lng: 144.7937 },
  "Virgin Islands": { lat: 18.3358, lng: -64.8963 },
};

export const countryCenters: Record<string, Coordinate> = {
  "United States": { lat: 39.8283, lng: -98.5795 },
  "U.S.": { lat: 39.8283, lng: -98.5795 },
  US: { lat: 39.8283, lng: -98.5795 },
  Canada: { lat: 56.1304, lng: -106.3468 },
  Mexico: { lat: 23.6345, lng: -102.5528 },
  Australia: { lat: -25.2744, lng: 133.7751 },
  China: { lat: 35.8617, lng: 104.1954 },
  Japan: { lat: 36.2048, lng: 138.2529 },
  Germany: { lat: 51.1657, lng: 10.4515 },
  Romania: { lat: 45.9432, lng: 24.9668 },
  Switzerland: { lat: 46.8182, lng: 8.2275 },
  Panama: { lat: 8.538, lng: -80.7821 },
  Liberia: { lat: 6.4281, lng: -9.4295 },
  Bahamas: { lat: 25.0343, lng: -77.3963 },
  "The Bahamas": { lat: 25.0343, lng: -77.3963 },
  Italy: { lat: 41.8719, lng: 12.5674 },
  UK: { lat: 55.3781, lng: -3.436 },
  "United Kingdom": { lat: 55.3781, lng: -3.436 },
  Cyprus: { lat: 35.1264, lng: 33.4299 },
  Pakistan: { lat: 30.3753, lng: 69.3451 },
  Caribbean: { lat: 15.3266, lng: -61.1252 },
  "South America": { lat: -14.235, lng: -51.9253 },
  Asia: { lat: 34.0479, lng: 100.6197 },
  International: { lat: 1.0, lng: -25.0 },
};

export function districtCoordinate(state: string | null, district: string | null) {
  const center = state ? stateCenters[state] : null;
  if (!center) return null;

  const text = (district ?? "").toLowerCase();
  let latOffset = 0;
  let lngOffset = 0;

  if (text.includes("northern")) latOffset += 1.1;
  if (text.includes("southern")) latOffset -= 1.1;
  if (text.includes("eastern")) lngOffset += 1.1;
  if (text.includes("western")) lngOffset -= 1.1;
  if (text.includes("middle") || text.includes("central")) {
    latOffset += 0.15;
    lngOffset += 0.15;
  }

  return {
    lat: Number((center.lat + latOffset).toFixed(4)),
    lng: Number((center.lng + lngOffset).toFixed(4)),
  };
}

export function splitCountries(value: string | null | undefined) {
  if (!value) return [];
  return value
    .replace(/\bU\.S\.\b/g, "United States")
    .split(/;|,|\band\b|↔|\//i)
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .filter((part) => !/^(missing|multiple|international|\d+|\?)$/i.test(part));
}
