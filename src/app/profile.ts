export type UserProfile = {
  schema_version: 1;
  sex: "male" | "female";
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_base: "low" | "moderate" | "high";
  goal: "fat_loss" | "muscle_gain" | "recomp";
  training_experience: "beginner" | "intermediate" | "advanced";
  training_days_per_week: number;
  training_time_pref: "morning" | "afternoon" | "evening";
  equipment: "gym" | "home" | "mixed";
  dietary_restrictions: string[];
  injuries: string[];
  updated_at: string;
};

const KEY = "app:profile";

export function getProfile(): UserProfile | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function getOrCreateDefaultProfile(): UserProfile {
  const existing = getProfile();
  if (existing) return existing;

  const def: UserProfile = {
    schema_version: 1,
    sex: "male",
    age: 40,
    height_cm: 175,
    weight_kg: 80,
    activity_base: "moderate",
    goal: "recomp",
    training_experience: "intermediate",
    training_days_per_week: 4,
    training_time_pref: "morning",
    equipment: "gym",
    dietary_restrictions: [],
    injuries: [],
    updated_at: new Date().toISOString()
  };

  saveProfile(def);
  return def;
}
