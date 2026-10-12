import type { Polygon, MultiPolygon } from "geojson";
export function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : NaN; }
export interface SpeciesMedia { type: string; identifier: string; references: string; creator: string }
export interface Occurrence {
  decimalLatitude: number; decimalLongitude: number; municipality: string; county: string;
  locality: string; stateProvince: string; country: string; media: SpeciesMedia[];
}
export interface SpeciesData {
  count: number; results: Occurrence[]; usageKey?: number; speciesKey?: number; scientificName: string;
  geojson: Polygon | MultiPolygon | null; address: Record<string, string>; name: string; display_name: string;
}
function coordinates(value: unknown, depth: number): boolean {
  return Array.isArray(value) && value.length > 0 && (depth === 0
    ? value.length >= 2 && value.every(n => typeof n === "number" && Number.isFinite(n))
    : value.every(item => coordinates(item, depth - 1)));
}
export function parseSpeciesData(value: unknown): SpeciesData {
  const v = objectValue(value), geometry = objectValue(v.geojson);
  const geojson = geometry.type === "Polygon" && coordinates(geometry.coordinates, 2)
    ? geometry as unknown as Polygon
    : geometry.type === "MultiPolygon" && coordinates(geometry.coordinates, 3)
      ? geometry as unknown as MultiPolygon : null;
  const address: Record<string, string> = {};
  for (const [key, entry] of Object.entries(objectValue(v.address))) if (typeof entry === "string") address[key] = entry;
  const raw: unknown[] = Array.isArray(v.results) ? v.results : [];
  return { count: number(v.count) || 0, usageKey: Number.isFinite(number(v.usageKey)) ? number(v.usageKey) : undefined,
    speciesKey: Number.isFinite(number(v.speciesKey)) ? number(v.speciesKey) : undefined,
    scientificName: text(v.scientificName), geojson, address, name: text(v.name), display_name: text(v.display_name),
    results: raw.map(item => {
      const r = objectValue(item), media: unknown[] = Array.isArray(r.media) ? r.media : [];
      return { decimalLatitude: number(r.decimalLatitude), decimalLongitude: number(r.decimalLongitude),
        municipality: text(r.municipality), county: text(r.county), locality: text(r.locality),
        stateProvince: text(r.stateProvince), country: text(r.country),
        media: media.map(item => { const m = objectValue(item); return {
          type: text(m.type), identifier: text(m.identifier), references: text(m.references), creator: text(m.creator)
        }; }).filter(m => /^https?:\/\//i.test(m.identifier)) };
    }) };
}
