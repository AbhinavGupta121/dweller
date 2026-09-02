/**
 * Curated subject list for Harvard Yard.
 *
 * `osm` matches a feature harvested by harvest.mjs (footprint geometry comes
 * from there). `at` is an explicit fallback for things OSM tags as bare nodes.
 *
 * `radiusM` is the relevance radius — how close you must be for this subject to
 * be worth talking about. It is deliberately hand-tuned rather than derived:
 * Widener is worth mentioning from across Tercentenary Theatre, the John Harvard
 * statue is not worth mentioning until you are basically standing at it.
 */

export const AREA = {
  id: "harvard-yard",
  name: "Harvard Yard",
  center: [-71.1169, 42.3744],
  // clip for the footpath graph — tighter than the harvest bbox
  clip: [42.3705, -71.1240, 42.3790, -71.1120],
};

export const SUBJECTS = [
  {
    id: "johnston-gate",
    name: "Johnston Gate",
    osm: "node/8699773897",
    at: [-71.118490, 42.374679],
    radiusM: 45,
    wikipedia: "Gates of Harvard Yard",
  },
  {
    id: "massachusetts-hall",
    name: "Massachusetts Hall",
    osm: "way/29938509",
    radiusM: 55,
    wikipedia: "Massachusetts Hall (Harvard University)",
  },
  {
    id: "harvard-hall",
    name: "Harvard Hall",
    osm: "way/29934296",
    radiusM: 55,
    wikipedia: "Harvard Hall",
  },
  {
    id: "holden-chapel",
    name: "Holden Chapel",
    osm: "way/29684572",
    radiusM: 45,
    wikipedia: "Holden Chapel",
  },
  {
    id: "hollis-hall",
    name: "Hollis Hall",
    osm: "way/29630925",
    radiusM: 45,
    wikipedia: "List of Harvard College freshman dormitories",
  },
  {
    id: "university-hall",
    name: "University Hall",
    osm: "way/29530618",
    radiusM: 55,
    wikipedia: "University Hall (Harvard University)",
  },
  {
    id: "john-harvard-statue",
    name: "The John Harvard Statue",
    osm: "node/358277010",
    at: [-71.116936, 42.374437],
    radiusM: 30,
    wikipedia: "Statue of John Harvard",
  },
  {
    id: "widener-library",
    name: "Widener Library",
    osm: "way/29725638",
    radiusM: 80,
    wikipedia: "Widener Library",
  },
  {
    id: "memorial-church",
    name: "Memorial Church",
    osm: "way/29789985",
    radiusM: 70,
    wikipedia: "Memorial Church of Harvard University",
  },
  {
    id: "tercentenary-theatre",
    name: "Tercentenary Theatre",
    at: [-71.116330, 42.374135],
    radiusM: 55,
    wikipedia: "Harvard Yard",
  },
  {
    id: "sever-hall",
    name: "Sever Hall",
    osm: "way/29530656",
    radiusM: 50,
    wikipedia: "Sever Hall",
  },
  {
    id: "emerson-hall",
    name: "Emerson Hall",
    osm: "way/29821070",
    radiusM: 45,
    wikipedia: null,
  },
  {
    id: "widener-steps",
    name: "The Widener Steps",
    at: [-71.116620, 42.373950],
    radiusM: 30,
    wikipedia: "Widener Library",
  },
  {
    id: "wadsworth-house",
    name: "Wadsworth House",
    osm: "way/29684617",
    radiusM: 45,
    wikipedia: null,
  },
  {
    id: "dexter-gate",
    name: "Dexter Gate",
    at: [-71.116278, 42.372775],
    radiusM: 30,
    wikipedia: "Gates of Harvard Yard",
  },
  {
    id: "science-center",
    name: "The Science Center",
    osm: "relation/64766",
    radiusM: 70,
    wikipedia: "Zimmer Hall",
  },
  {
    id: "memorial-hall",
    name: "Memorial Hall",
    osm: "way/29530473",
    radiusM: 85,
    wikipedia: "Memorial Hall (Harvard University)",
  },
  {
    id: "old-burying-ground",
    name: "The Old Burying Ground",
    osm: "way/427504034",
    at: [-71.119861, 42.375034],
    radiusM: 50,
    wikipedia: "Old Burying Ground (Cambridge, Massachusetts)",
  },
  {
    id: "smith-campus-center",
    name: "Smith Campus Center",
    osm: "way/29639218",
    radiusM: 50,
    wikipedia: "Harvard Square",
  },
  {
    id: "harvard-square",
    name: "Harvard Square",
    at: [-71.118889, 42.373611],
    radiusM: 70,
    wikipedia: "Harvard Square",
  },
];
