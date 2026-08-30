export type SizeGroup = "tops" | "bottoms" | "fitted_hat" | "one_size";

export const SIZE_GROUPS: SizeGroup[] = ["tops", "bottoms", "fitted_hat", "one_size"];

export const SIZE_GROUP_LABELS: Record<SizeGroup, string> = {
  tops: "Tops (jerseys, hoodies, polo, jackets)",
  bottoms: "Bottoms (pants, sweatpants, shorts)",
  fitted_hat: "Fitted hats",
  one_size: "One size",
};

// Standard apparel size charts, youth first then adult, matching the
// order reps read a chart in.
export const SIZES_BY_GROUP: Record<SizeGroup, string[]> = {
  tops: [
    "YXS",
    "YS",
    "YM",
    "YL",
    "YXL",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "2XL",
    "3XL",
    "4XL",
    "5XL",
    "6XL",
    "7XL",
    "8XL",
  ],
  bottoms: ["YXS", "YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"],
  fitted_hat: ["XS", "S", "M", "L", "XL"],
  one_size: ["One Size"],
};

export function isSizeGroup(value: string): value is SizeGroup {
  return (SIZE_GROUPS as string[]).includes(value);
}
