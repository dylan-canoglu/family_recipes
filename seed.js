require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to your .env file."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getOrCreateHouseholdId() {
  console.log("Checking households table...");

  const { data: households, error: selectError } = await supabase
    .from("households")
    .select("id")
    .limit(1);

  if (selectError) {
    console.error("Failed to read households:", selectError.message);
    throw selectError;
  }

  if (households && households.length > 0) {
    const householdId = households[0].id;
    console.log(`Using existing household id: ${householdId}`);
    return householdId;
  }

  console.log('No households found. Inserting "My Family"...');
  const { data: created, error: insertError } = await supabase
    .from("households")
    .insert({ name: "My Family" })
    .select("id")
    .single();

  if (insertError) {
    console.error("Failed to insert household:", insertError.message);
    throw insertError;
  }

  console.log(`Created household "My Family" with id: ${created.id}`);
  return created.id;
}

async function seedRecipes(householdId) {
  const recipesPath = path.join(__dirname, "recipes_v4.json");
  console.log(`Reading recipes from ${recipesPath}...`);

  const recipes = JSON.parse(fs.readFileSync(recipesPath, "utf8"));
  if (!Array.isArray(recipes)) {
    throw new Error("recipes_v4.json must contain a JSON array");
  }

  console.log(`Inserting ${recipes.length} recipes into the recipes table...`);

  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < recipes.length; i += 1) {
    const recipe = recipes[i];
    const title = recipe.title || "(untitled)";
    const payload = { ...recipe, household_id: householdId };
    delete payload.total_time_min;

    if (payload.dish_type === "Dough") {
      payload.dish_type = "Pastry";
    } else if (payload.dish_type === "Other") {
      payload.dish_type = "Side";
    }

    const { error } = await supabase.from("recipes").insert(payload);

    if (error) {
      failed += 1;
      console.error(`[${i + 1}/${recipes.length}] Failed: ${title}`);
      console.error(`  ${error.message}`);
      continue;
    }

    inserted += 1;
    console.log(`[${i + 1}/${recipes.length}] Inserted: ${title}`);
  }

  console.log(
    `Done. Inserted ${inserted}/${recipes.length} recipes (${failed} failed).`
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  try {
    const householdId = await getOrCreateHouseholdId();
    await seedRecipes(householdId);
  } catch (err) {
    console.error("Seed failed:", err.message || err);
    process.exit(1);
  }
}

main();
