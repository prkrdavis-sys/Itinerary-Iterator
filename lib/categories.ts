import type { Category } from "./schema";

export function categoryLabel(category: Category): string {
  switch (category) {
    case "museum":
      return "Museum";
    case "food":
      return "Food";
    case "sight":
      return "Sight";
    case "stay":
      return "Stay";
    case "transit":
      return "Transit";
    case "neighborhood":
      return "Neighborhood";
    case "activity":
      return "Activity";
    default: {
      const neverCategory: never = category;
      return neverCategory;
    }
  }
}
