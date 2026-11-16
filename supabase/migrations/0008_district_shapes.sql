-- Phase 6 of docs/ward-map-prd.md: districts drawn by hand. Each district's
-- shape is a GeoJSON MultiPolygon in lat/lng; null until one is drawn.
-- Covered by the existing districts_all policy.

alter table public.districts add column boundary jsonb;
