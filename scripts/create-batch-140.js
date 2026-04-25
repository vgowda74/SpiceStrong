#!/usr/bin/env node
/**
 * Creates the batch prompt Excel file for 140 new curated recipes (10 per protein).
 * Each recipe targets a specific cuisine + fitness goal combination for variety.
 */
const XLSX = require('xlsx');
const path = require('path');

const recipes = [
  // ── CHICKEN (10) ──
  'Create a high-protein Hainanese Chicken Rice recipe. Cuisine: Singaporean. Protein: chicken breast. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Jamaican Jerk Chicken recipe. Cuisine: Caribbean. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Chicken Karaage Bowl recipe. Cuisine: Japanese. Protein: chicken thigh. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Chicken Pho Bowl recipe. Cuisine: Vietnamese. Protein: chicken breast. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Low.',
  'Create a high-protein Chicken Kebab Plate recipe. Cuisine: Persian. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Chicken Adobo recipe. Cuisine: Filipino. Protein: chicken thigh. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Lemongrass Chicken Bowl recipe. Cuisine: Vietnamese. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Buffalo Chicken Lettuce Wraps recipe. Cuisine: American. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Keto. Spice: High.',
  'Create a high-protein Tuscan Chicken Skillet recipe. Cuisine: Italian. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Chicken Hyderabadi Dum Biryani recipe. Cuisine: Indian / Hyderabadi. Protein: chicken thigh. Difficulty: Advanced. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Medium.',

  // ── BEEF (10) ──
  'Create a high-protein Vietnamese Bun Bo Hue recipe. Cuisine: Vietnamese. Protein: lean beef. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: High Energy. Spice: High.',
  'Create a high-protein Argentinian Asado Steak Bowl recipe. Cuisine: Argentinian. Protein: lean beef sirloin. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Chinese Mongolian Beef recipe. Cuisine: Chinese. Protein: lean beef. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Lebanese Beef Kibbeh recipe. Cuisine: Lebanese. Protein: lean ground beef. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Italian Beef Carpaccio Bowl recipe. Cuisine: Italian. Protein: lean beef sirloin. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Keto. Spice: Low.',
  'Create a high-protein Thai Beef Pad Krapow recipe. Cuisine: Thai. Protein: lean ground beef. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Mexican Beef Albondigas Soup recipe. Cuisine: Mexican. Protein: lean ground beef. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Greek Beef Stifado recipe. Cuisine: Greek. Protein: lean beef. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Indian Beef Pepper Fry recipe. Cuisine: Indian / Kerala. Protein: lean beef. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Korean Galbi Short Ribs Bowl recipe. Cuisine: Korean. Protein: lean beef. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Medium.',

  // ── LAMB (10) ──
  'Create a high-protein Turkish Adana Lamb Kebab recipe. Cuisine: Turkish. Protein: lean ground lamb. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Medium.',
  'Create a high-protein Lamb Shawarma Plate recipe. Cuisine: Middle Eastern. Protein: lean lamb. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Greek Lamb Kleftiko recipe. Cuisine: Greek. Protein: lean lamb. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Mongolian Lamb Hot Pot recipe. Cuisine: Chinese / Mongolian. Protein: lean lamb. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Medium.',
  'Create a high-protein Spanish Lamb Albondigas recipe. Cuisine: Spanish. Protein: lean ground lamb. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Indian Lamb Vindaloo recipe. Cuisine: Indian / Goan. Protein: lean lamb. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: High.',
  'Create a high-protein Lebanese Lamb Kibbeh recipe. Cuisine: Lebanese. Protein: lean ground lamb. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Lamb Shish Kebab recipe. Cuisine: Persian. Protein: lean lamb. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Mexican Barbacoa Lamb Bowl recipe. Cuisine: Mexican. Protein: lean lamb. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Keto. Spice: Medium.',
  'Create a high-protein Indian Lamb Galouti Kebab recipe. Cuisine: Indian / Lucknowi. Protein: lean ground lamb. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',

  // ── GOAT (10) ──
  'Create a high-protein Caribbean Goat Stew recipe. Cuisine: Caribbean. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Indian Goat Sukka recipe. Cuisine: Indian / Mangalorean. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein African Goat Curry recipe. Cuisine: Kenyan. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Indian Goat Korma recipe. Cuisine: Indian / Awadhi. Protein: goat meat. Difficulty: Advanced. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Goat Bhuna Masala recipe. Cuisine: Indian / Bengali. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Greek Goat Stew recipe. Cuisine: Greek. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Indian Goat Saagwala recipe. Cuisine: Indian / Punjabi. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Medium.',
  'Create a high-protein Mexican Goat Birria recipe. Cuisine: Mexican. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Keto. Spice: Medium.',
  'Create a high-protein Italian Capretto al Forno Roasted Goat recipe. Cuisine: Italian. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Indian Goat Chettinad recipe. Cuisine: Indian / Chettinad. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',

  // ── PORK (10) ──
  'Create a high-protein Cuban Mojo Pork Bowl recipe. Cuisine: Cuban. Protein: pork tenderloin. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Korean Bossam Pork Wrap recipe. Cuisine: Korean. Protein: pork tenderloin. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Italian Pork Saltimbocca recipe. Cuisine: Italian. Protein: pork tenderloin. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Keto. Spice: Low.',
  'Create a high-protein Filipino Sisig Bowl recipe. Cuisine: Filipino. Protein: lean pork. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Medium.',
  'Create a high-protein German Schweinefilet recipe. Cuisine: German. Protein: pork tenderloin. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Spanish Pork Albondigas recipe. Cuisine: Spanish. Protein: lean ground pork. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Hungarian Pork Paprikash recipe. Cuisine: Hungarian. Protein: lean pork. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Medium.',
  'Create a high-protein Hawaiian Kalua Pork Bowl recipe. Cuisine: Hawaiian. Protein: pork tenderloin. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Korean Pork Bibimbap recipe. Cuisine: Korean. Protein: lean ground pork. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Medium.',
  'Create a high-protein Indian Pork Vindaloo recipe. Cuisine: Indian / Goan. Protein: lean pork. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',

  // ── FISH (10) ──
  'Create a high-protein Peruvian Ceviche recipe. Cuisine: Peruvian. Protein: white fish fillet. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Greek Baked Branzino recipe. Cuisine: Greek. Protein: branzino fish. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Japanese Salmon Onigirazu recipe. Cuisine: Japanese. Protein: salmon. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Low.',
  'Create a high-protein Italian Fish Acqua Pazza recipe. Cuisine: Italian. Protein: white fish fillet. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Mexican Fish Veracruz recipe. Cuisine: Mexican. Protein: white fish. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Indian Fish Amritsari recipe. Cuisine: Indian / Punjabi. Protein: fish fillet. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Korean Spicy Cod Stew recipe. Cuisine: Korean. Protein: cod. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Mediterranean Tuna Steak Bowl recipe. Cuisine: Mediterranean. Protein: tuna steak. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Thai Steamed Fish recipe. Cuisine: Thai. Protein: white fish. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Cajun Blackened Mahi Mahi recipe. Cuisine: American / Cajun. Protein: mahi mahi. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Keto. Spice: High.',

  // ── PRAWNS (10) ──
  'Create a high-protein Spanish Gambas al Ajillo recipe. Cuisine: Spanish. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Keto. Spice: Low.',
  'Create a high-protein Thai Tom Yum Soup recipe. Cuisine: Thai. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Greek Shrimp Saganaki recipe. Cuisine: Greek. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Indian Prawn Vindaloo recipe. Cuisine: Indian / Goan. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Italian Shrimp Scampi Pasta recipe. Cuisine: Italian. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Low.',
  'Create a high-protein Mexican Shrimp Aguachile recipe. Cuisine: Mexican. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Vietnamese Prawn Pho recipe. Cuisine: Vietnamese. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Chinese Salt and Pepper Shrimp recipe. Cuisine: Chinese. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Korean Spicy Shrimp Stir-Fry recipe. Cuisine: Korean. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Mediterranean Shrimp Salad recipe. Cuisine: Mediterranean. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Keto. Spice: Low.',

  // ── EGGS (10) ──
  'Create a high-protein Tunisian Brik Egg Pastry recipe. Cuisine: Tunisian. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Korean Tornado Omelette recipe. Cuisine: Korean. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Indian Masala Omelette recipe. Cuisine: Indian. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Chinese Steamed Egg Custard recipe. Cuisine: Chinese. Protein: eggs. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Italian Egg Carbonara recipe. Cuisine: Italian. Protein: eggs. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Low.',
  'Create a high-protein Mexican Huevos Rancheros recipe. Cuisine: Mexican. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Egg White Mediterranean Frittata recipe. Cuisine: Mediterranean. Protein: egg whites. Difficulty: Beginner. Meal: breakfast. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Korean Soft Tofu Egg Stew recipe. Cuisine: Korean. Protein: eggs and tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: High.',
  'Create a high-protein Spanish Tortilla Espanola recipe. Cuisine: Spanish. Protein: eggs. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Indian Akoori Parsi Scrambled Eggs recipe. Cuisine: Indian / Parsi. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Fitness goal: Balanced. Spice: Medium.',

  // ── PANEER (10) ──
  'Create a high-protein Paneer Pasanda recipe. Cuisine: Indian / Mughlai. Protein: paneer. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Paneer Lababdar recipe. Cuisine: Indian / North Indian. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Medium.',
  'Create a high-protein Methi Paneer Malai recipe. Cuisine: Indian / North Indian. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Keto. Spice: Low.',
  'Create a high-protein Paneer Do Pyaza recipe. Cuisine: Indian / Lucknowi. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Paneer Chilli recipe. Cuisine: Indo-Chinese. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Paneer Tikka Salad Bowl recipe. Cuisine: Indian Fusion. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Paneer Lasooni recipe. Cuisine: Indian / Punjabi. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Paneer Bharta recipe. Cuisine: Indian / Bengali. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Mediterranean Grilled Paneer Skewers recipe. Cuisine: Mediterranean. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Keto. Spice: Low.',
  'Create a high-protein Paneer Burji Roll recipe. Cuisine: Indian Street Food. Protein: paneer. Difficulty: Beginner. Meal: breakfast. Fitness goal: High Energy. Spice: Medium.',

  // ── TOFU (10) ──
  'Create a high-protein Korean Dubu Jorim Braised Tofu recipe. Cuisine: Korean. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Thai Tofu Massaman Curry recipe. Cuisine: Thai. Protein: firm tofu. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Vietnamese Tofu Banh Mi recipe. Cuisine: Vietnamese. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Indo-Chinese Tofu Manchurian recipe. Cuisine: Indo-Chinese. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Japanese Tofu Hambagu recipe. Cuisine: Japanese. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Tofu Thai Pad Krapow recipe. Cuisine: Thai. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Mediterranean Tofu Souvlaki recipe. Cuisine: Mediterranean Fusion. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Spicy Korean Tofu Bibimbap recipe. Cuisine: Korean. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Medium.',
  'Create a high-protein Tofu Larb Salad recipe. Cuisine: Thai / Lao. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Tofu Buddha Bowl recipe. Cuisine: Asian Fusion. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Low.',

  // ── SOY (10) ──
  'Create a high-protein Soy Chunk Biryani recipe. Cuisine: Indian / Hyderabadi. Protein: soy chunks. Difficulty: Intermediate. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Medium.',
  'Create a high-protein Soy Chunk Manchurian recipe. Cuisine: Indo-Chinese. Protein: soy chunks. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',
  'Create a high-protein Soy Chunk Curry recipe. Cuisine: Indian / North Indian. Protein: soy chunks. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Soy Chunk Pulao recipe. Cuisine: Indian. Protein: soy chunks. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Medium.',
  'Create a high-protein Soy Chunk Stir-Fry recipe. Cuisine: Chinese. Protein: soy chunks. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Soy Chunk Kheema recipe. Cuisine: Indian / Punjabi. Protein: soy granules. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Korean Soy Chunk Bibimbap recipe. Cuisine: Korean. Protein: soy chunks. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Medium.',
  'Create a high-protein Mexican Soy Chunk Tacos recipe. Cuisine: Mexican. Protein: soy granules. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Medium.',
  'Create a high-protein Italian Soy Bolognese recipe. Cuisine: Italian. Protein: soy granules. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Thai Soy Chunk Stir-Fry recipe. Cuisine: Thai. Protein: soy chunks. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: High.',

  // ── BEANS (10) ──
  'Create a high-protein Cuban Black Beans and Rice recipe. Cuisine: Cuban. Protein: black beans. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Low.',
  'Create a high-protein Mediterranean Lentil Salad Bowl recipe. Cuisine: Mediterranean. Protein: green lentils. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Egyptian Koshari recipe. Cuisine: Egyptian. Protein: lentils and chickpeas. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Medium.',
  'Create a high-protein Indian Sambar Lentil Stew recipe. Cuisine: Indian / South Indian. Protein: toor dal. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Indian Misal Pav recipe. Cuisine: Indian / Maharashtrian. Protein: sprouted moth beans. Difficulty: Beginner. Meal: breakfast. Fitness goal: High Energy. Spice: High.',
  'Create a high-protein Greek Fasolada Bean Soup recipe. Cuisine: Greek. Protein: white beans. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Mexican Frijoles Charros recipe. Cuisine: Mexican. Protein: pinto beans. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Indian Lobia Black-Eyed Pea Curry recipe. Cuisine: Indian / Punjabi. Protein: black-eyed peas. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: Balanced. Spice: Medium.',
  'Create a high-protein Lebanese Foul Mudammas recipe. Cuisine: Lebanese. Protein: fava beans. Difficulty: Beginner. Meal: breakfast. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Italian Pasta e Fagioli recipe. Cuisine: Italian. Protein: cannellini beans. Difficulty: Beginner. Meal: lunch/dinner. Fitness goal: High Energy. Spice: Low.',

  // ── MILK / DAIRY (10) ──
  'Create a high-protein Greek Yogurt Bark recipe. Cuisine: American Health. Protein: Greek yogurt. Difficulty: Beginner. Meal: snack. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Mediterranean Tzatziki Dip recipe. Cuisine: Greek. Protein: Greek yogurt. Difficulty: Beginner. Meal: snack. Fitness goal: Keto. Spice: Low.',
  'Create a high-protein Indian Shrikhand recipe. Cuisine: Indian / Maharashtrian. Protein: hung curd. Difficulty: Beginner. Meal: dessert. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Cottage Cheese Pancakes recipe. Cuisine: American. Protein: cottage cheese. Difficulty: Beginner. Meal: breakfast. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Cottage Cheese Bowl with Berries recipe. Cuisine: American. Protein: cottage cheese. Difficulty: Beginner. Meal: breakfast. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Indian Lassi Bowl recipe. Cuisine: Indian / Punjabi. Protein: yogurt. Difficulty: Beginner. Meal: snack. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Iranian Mast-o-Khiar Yogurt Dip recipe. Cuisine: Persian. Protein: Greek yogurt. Difficulty: Beginner. Meal: snack. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Tropical Coconut Yogurt Smoothie recipe. Cuisine: Tropical. Protein: Greek yogurt. Difficulty: Beginner. Meal: breakfast. Fitness goal: High Energy. Spice: Low.',
  'Create a high-protein Pistachio Cardamom Lassi recipe. Cuisine: Indian. Protein: Greek yogurt. Difficulty: Beginner. Meal: snack. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Frozen Greek Yogurt Smoothie recipe. Cuisine: American. Protein: Greek yogurt. Difficulty: Beginner. Meal: snack. Fitness goal: Fat Loss. Spice: Low.',

  // ── WHEY / PROTEIN POWDER (10) ──
  'Create a high-protein Whey Protein French Toast recipe. Cuisine: French. Protein: whey protein. Difficulty: Beginner. Meal: breakfast. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Whey Protein Cheesecake Cups recipe. Cuisine: American. Protein: whey protein. Difficulty: Beginner. Meal: dessert. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Pre-Workout Whey Coffee Smoothie recipe. Cuisine: American. Protein: whey protein. Difficulty: Beginner. Meal: snack. Fitness goal: High Energy. Spice: Low.',
  'Create a high-protein Whey Protein Tiramisu Bowl recipe. Cuisine: Italian. Protein: whey protein. Difficulty: Beginner. Meal: dessert. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Whey Protein Mug Cake recipe. Cuisine: American. Protein: whey protein. Difficulty: Beginner. Meal: dessert. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Whey Protein Chia Pudding Parfait recipe. Cuisine: American Health. Protein: whey protein. Difficulty: Beginner. Meal: breakfast. Fitness goal: Fat Loss. Spice: Low.',
  'Create a high-protein Whey Protein Crepes recipe. Cuisine: French. Protein: whey protein. Difficulty: Beginner. Meal: breakfast. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Indian Whey Protein Lassi recipe. Cuisine: Indian Fusion. Protein: whey protein. Difficulty: Beginner. Meal: snack. Fitness goal: Muscle Gain. Spice: Low.',
  'Create a high-protein Whey Protein Brownie Bites recipe. Cuisine: American. Protein: whey protein. Difficulty: Beginner. Meal: snack. Fitness goal: Balanced. Spice: Low.',
  'Create a high-protein Tropical Whey Protein Smoothie Bowl recipe. Cuisine: Tropical. Protein: whey protein. Difficulty: Beginner. Meal: breakfast. Fitness goal: High Energy. Spice: Low.',
];

console.log(`Total recipes: ${recipes.length}`);
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([['Prompt'], ...recipes.map(r => [r])]);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const outPath = path.join(__dirname, '..', 'Recipes', 'prompts', 'batch_140.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Prompts file created: ${outPath}`);
