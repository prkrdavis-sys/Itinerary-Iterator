import type { Category, Stop } from "./schema";

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

export function spotEmoji(stop: Pick<Stop, "emoji" | "category">): string {
  if (stop.emoji) return stop.emoji;
  switch (stop.category) {
    case "museum":
      return "🖼️";
    case "food":
      return "🍽️";
    case "sight":
      return "📍";
    case "stay":
      return "🏨";
    case "transit":
      return "🚉";
    case "neighborhood":
      return "🏘️";
    case "activity":
      return "🎡";
    default: {
      const neverCategory: never = stop.category;
      return neverCategory;
    }
  }
}

export function stopPhotos(stop: Pick<Stop, "photo" | "photos">): string[] {
  if (stop.photos.length > 0) return stop.photos;
  return stop.photo ? [stop.photo] : [];
}
