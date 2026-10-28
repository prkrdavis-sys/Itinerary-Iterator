import credits from "@/data/photo-credits.json";

export type PhotoCredit = {
  author: string;
  license: string;
  source: string;
};

const byPath = credits as Record<string, PhotoCredit>;

export function photoCredit(src: string): PhotoCredit | null {
  return byPath[src] ?? null;
}
