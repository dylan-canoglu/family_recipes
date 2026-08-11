// The single family household every recipe and meal plan belongs to. There is
// no multi-household support yet; if that ever arrives this should come from
// the signed-in user's profile instead of a constant.
export const HOUSEHOLD_ID = 'daf749d9-2b65-44fc-95ff-cc2824412755';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
