/** Paginasjablonen die je zelf kunt kiezen (R72). De blokken zelf staan in components/editor/templates.ts. */
export const PAGE_TEMPLATES = ["notulen", "logboek", "contentplanning", "idee"] as const;
export type PageTemplate = (typeof PAGE_TEMPLATES)[number];

const vandaag = () =>
  new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

export const PAGE_TEMPLATE_LABELS: Record<PageTemplate, string> = {
  notulen: "Vergadernotulen",
  logboek: "Logboek",
  contentplanning: "Contentplanning",
  idee: "Idee uitwerken",
};

/** Startitel van een nieuwe pagina uit een sjabloon. Volgens de tip "maak de titel logisch en duidelijk". */
export const PAGE_TEMPLATE_TITLES: Record<PageTemplate, () => string> = {
  notulen: () => `Notulen ${vandaag()}`,
  logboek: () => "Logboek",
  contentplanning: () => "Contentplanning",
  idee: () => "Nieuw idee",
};
