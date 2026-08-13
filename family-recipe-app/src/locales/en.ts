// Source of truth for every interface string, and the fallback for anything
// a translation has not caught up with yet. Keys are grouped by screen.
//
// {placeholders} are substituted by t(key, vars).

export const en = {
  // --- shared -----------------------------------------------------------
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.search': 'Search',
  'common.loading': 'Warming up the kitchen…',
  'common.signIn': 'Sign In',
  'common.signOut': 'Sign Out',
  'common.signUp': 'Sign Up',
  'common.minutes': 'min',
  'common.servings': 'servings',
  'common.optional': 'Optional',
  'common.required': 'required',

  // --- navigation -------------------------------------------------------
  'nav.appName': 'The Vault',
  'nav.home': 'Home',
  'nav.searchVault': 'Search Vault',
  'nav.vault': 'Vault',
  'nav.discovery': 'Discovery',
  'nav.planner': 'Planner',
  'nav.mealPlanner': 'Meal Planner',
  'nav.shoppingList': 'Shopping List',
  'nav.pantry': 'What Can I Make?',
  'nav.favorites': 'Favorites',
  'nav.dashboard': 'Dashboard',
  'nav.addRecipe': 'Add Recipe',
  'nav.admin': 'Admin',
  'nav.more': 'More',
  'nav.closeMenu': 'Close menu',
  'nav.language': 'Language',

  // --- guest ------------------------------------------------------------
  'guest.chip': 'Guest',
  'guest.chipTitle': 'Browsing read-only. Sign in to save anything.',
  'guest.explanation': 'Browsing read-only as a guest. Sign in to favorite, plan and add recipes.',
  'guest.leave': 'Leave guest mode',
  'guest.explore': 'Explore as guest',
  'guest.exploreHint': 'Browse every recipe read-only. No account, and nothing you tap is saved.',

  // --- welcome ----------------------------------------------------------
  'welcome.title': 'The Family Recipe Vault',
  'welcome.blurb':
    'Two hundred handwritten family recipes, scanned and searchable — with a meal planner, a shopping list that merges everything, and a cook mode for the kitchen counter.',
  'welcome.guestNote':
    "Guests get the whole vault read-only — nothing is saved, and the family's favorites, notes and meal plan stay private.",

  // --- home -------------------------------------------------------------
  'home.heading': 'What are we cooking?',
  'home.onThePlan': 'On the plan today',
  'home.suggestion': "Tonight's suggestion",
  'home.shuffle': 'Show me another',
  'home.addToPlan': 'Add to plan',
  'home.viewRecipe': 'View recipe',

  // --- vault / catalog --------------------------------------------------
  'vault.title': 'The Vault',
  'vault.searchPlaceholder': 'Search recipes, ingredients…',
  'vault.filterAll': 'All',
  'vault.filterCollege': 'College Staples',
  'vault.filterMains': 'Genuine Mains',
  'vault.filterClassics': 'Family Classics',
  'vault.allDishTypes': 'All Dish Types',
  'vault.filterNeedsWork': 'Needs transcription',
  'vault.uncategorized': 'Uncategorized',
  'vault.gapTitle': 'title',
  'vault.gapIngredients': 'ingredients',
  'vault.gapInstructions': 'instructions',
  'vault.missingFields': 'Still needs: {fields}',
  'vault.reviewMode': 'Review Mode',
  'vault.shop': 'Shop',
  'vault.empty': 'Nothing matches that yet.',
  'vault.countShown': '{count} recipes',
  'vault.hide': 'Hide / Mark Junk',
  'vault.deleteConfirmTitle': 'Delete this recipe?',
  'vault.deleteConfirmBody':
    'This removes “{title}” for everyone, along with its favorites and meal-plan entries. This cannot be undone.',

  // --- recipe detail ----------------------------------------------------
  'recipe.ingredients': 'Ingredients',
  'recipe.instructions': 'Instructions',
  'recipe.notes': 'Family Notes',
  'recipe.prepTime': 'Prep',
  'recipe.cookTime': 'Cook',
  'recipe.totalTime': 'Total',
  'recipe.serves': 'Serves {count}',
  'recipe.cookMode': 'Cook Mode',
  'recipe.verifyOriginal': 'Verify Original',
  'recipe.backToRecipe': 'Back to recipe',
  'recipe.portionSingle': 'Single',
  'recipe.portionDouble': 'Double',
  'recipe.portionBatch': 'College Batch',
  'recipe.showTranslated': 'Show translation',
  'recipe.showOriginal': 'Show original',
  'recipe.showEnglish': 'Show English',
  'recipe.logCook': 'Log a cook',
  'recipe.addPhoto': 'Add photo',
  'recipe.suggestChanges': 'Suggest changes',
  'recipe.favorite': 'Favorite',
  'recipe.unfavorite': 'Remove from favorites',
  'recipe.signInToFavorite': 'Please sign in to favorite recipes!',
  'recipe.signInToPhoto': 'Please sign in to add photos!',
  'recipe.signInToLog': 'Please sign in to log a cook!',

  // --- cook mode --------------------------------------------------------
  'cook.title': 'Cook Mode',
  'cook.exit': 'Exit cook mode',
  'cook.toggleIngredients': 'Toggle ingredients',
  'cook.progress': '{done} of {total} steps done',
  'cook.stepDone': 'Step {n} done',
  'cook.startTimer': 'Start {minutes} min timer',
  'cook.timerDone': 'Done!',
  'cook.pause': 'Pause',
  'cook.resume': 'Resume',
  'cook.clearTimer': 'Clear timer',
  'cook.finished': 'Afiyet olsun! 🍽️',
  'cook.finishedHint': "All steps done — don't forget to log the cook.",

  // --- shopping list ----------------------------------------------------
  'shopping.title': 'Shopping List',
  'shopping.blurb':
    'Pick recipes and get one consolidated list — same ingredients across recipes are merged.',
  'shopping.recipes': 'Recipes ({count})',
  'shopping.addRecipe': 'Add recipe',
  'shopping.addThisWeek': "Add this week's plan",
  'shopping.clear': 'Clear',
  'shopping.inCart': '{done} / {total} in the cart',
  'shopping.empty': 'Pick a recipe to start a list.',
  'shopping.share': 'Share',
  'shopping.copied': 'Copied',
  'shopping.shareTitle': 'Send this list to Messages, WhatsApp or Notes',
  'shopping.exportHeader': 'Shopping list ({count} items)',
  'shopping.exportFor': 'For: {titles}',

  // --- pantry -----------------------------------------------------------
  'pantry.title': 'What Can I Make?',
  'pantry.blurb': "Tap what's in your kitchen — the vault finds the recipes that fit.",
  'pantry.moreNeeded': '~{count} more needed',
  'pantry.nothingSelected': 'Tap a few ingredients to see what you can cook.',
  'pantry.noMatches': 'Nothing matches those yet — try fewer ingredients.',

  // --- meal planner -----------------------------------------------------
  'planner.title': 'Meal Planner',
  'planner.signInTitle': 'Sign in to plan meals',
  'planner.signInBody': 'The meal plan is shared with the whole family.',
  'planner.suggest': 'Suggest meals',
  'planner.clearWeek': 'Clear week',
  'planner.removeConfirm': 'Remove this meal from the plan?',
  'planner.breakfast': 'Breakfast',
  'planner.lunch': 'Lunch',
  'planner.dinner': 'Dinner',
  'planner.snack': 'Snack',

  // --- auth -------------------------------------------------------------
  'auth.welcomeBack': 'Welcome Back',
  'auth.joinVault': 'Join the Vault',
  'auth.signInBlurb': 'Sign in to log your cooking and save favorites.',
  'auth.signUpBlurb': 'Create an account to personalize your recipe vault.',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.processing': 'Processing…',
  'auth.needAccount': "Don't have an account? Sign up",
  'auth.haveAccount': 'Already have an account? Sign in',
  'auth.checkEmail': 'Success! Check your email to verify your account.',

  // --- add / scan -------------------------------------------------------
  'add.signInTitle': 'Sign in to add a recipe',
  'add.signInBody': 'Contributions are tied to your account, so the family knows who added what.',
  'add.scanButton': '📷 Scan / Upload Recipe Picture',
  'add.scanHint':
    'Snap a notebook page — the text is read automatically and you correct it before saving. Or type it in below.',
  'add.handwritingWarningStrong': "Cursive handwriting can't be transcribed",
  'add.handwritingWarningRest':
    '— please type those recipes in by hand. The photo still gets attached either way, so the original page is always there to read.',
  'add.title': 'Recipe Title',
  'add.dishType': 'Dish Type',
  'add.complexity': 'Complexity',
  'add.cuisine': 'Cuisine',
  'add.prepTime': 'Prep Time (min)',
  'add.cookTime': 'Cook Time (min)',
  'add.servings': 'Servings',
  'add.ingredients': 'Ingredients',
  'add.instructions': 'Instructions',
  'add.notes': 'Family Notes (Optional)',
  'add.saveRecipe': 'Save Recipe',

  'scan.reviewTitle': 'Review Scanned Recipe',
  'scan.reading': 'Reading the scan… {pct}%',
  'scan.extracting': 'Extracting text from the picture — you can already start correcting fields below.',
  'scan.failed':
    "Couldn't read the image automatically (this needs a network connection the first time). Type the recipe in below — the scan will still be attached.",
  'scan.lowYieldStrong': 'Cursive handwriting cannot be transcribed',
  'scan.lowYieldRest':
    '— type this one in by hand. If the page is printed, a straight-on, well-lit photo or a different language above may help. The picture stays attached either way.',
  'scan.done':
    'Auto-read from the scan. Check every line against the picture — handwriting and accents come through wrong often, and amounts are the easiest thing to miss.',
  'scan.writtenIn': 'Written in',
  'scan.zoomIn': 'Zoom in',
  'scan.zoomOut': 'Zoom out',
  'scan.resetView': 'Reset view',
  'scan.saveRecipe': 'Save Recipe',

  // --- favorites / dashboard / discovery --------------------------------
  'favorites.title': 'Save Your Favorites',
  'favorites.body': 'Sign in to curate your personal collection of family recipes for quick access.',
  'favorites.empty': 'No favorites yet — tap the heart on a recipe.',
  'dashboard.signIn': 'Sign in to view your Dashboard',
  'discovery.signIn': 'Sign in for Discovery',
  'discovery.signInBody': 'These picks come from what your family has actually cooked and rated.',


  // --- pantry staples ---------------------------------------------------
  'staple.rice': 'Rice',
  'staple.pasta': 'Pasta',
  'staple.eggs': 'Eggs',
  'staple.groundmeat': 'Ground Meat / Köfte',
  'staple.chicken': 'Chicken',
  'staple.garlic': 'Garlic',
  'staple.onion': 'Onion',
  'staple.potato': 'Potato',
  'staple.tomato': 'Tomato',
  'staple.oliveoil': 'Olive Oil',
  'staple.butter': 'Butter',
  'staple.flour': 'Flour',
  'staple.milk': 'Milk',
  'staple.yogurt': 'Yogurt',
  'staple.cheese': 'Cheese',
  'staple.lemon': 'Lemon',
  'staple.lentils': 'Lentils',
  'staple.bulgur': 'Bulgur',
  // --- sync / status ----------------------------------------------------
  'sync.online': 'Online',
  'sync.offline': 'Offline — changes are saved on this device',
} as const;
