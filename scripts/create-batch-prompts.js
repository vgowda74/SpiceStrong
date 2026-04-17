#!/usr/bin/env node
/**
 * Creates the batch prompt Excel file for 137 curated recipes.
 */
const XLSX = require('xlsx');
const path = require('path');

const recipes = [
  // Chicken (11 remaining - Tikka Masala already done)
  'Create a high-protein Lemon Herb Grilled Chicken Breast recipe. Cuisine: Mediterranean. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Thai Basil Chicken Stir-Fry recipe. Cuisine: Thai. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Chicken Shawarma Bowl recipe. Cuisine: Middle Eastern. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Lighter Butter Chicken recipe. Cuisine: Indian / North Indian. Protein: chicken breast. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium. Use Greek yogurt instead of cream.',
  'Create a high-protein Chicken Fajitas recipe. Cuisine: Mexican. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Teriyaki Chicken Rice Bowl recipe. Cuisine: Japanese. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Chicken Keema Matar recipe. Cuisine: Indian / North Indian. Protein: ground chicken. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Greek Chicken Souvlaki recipe. Cuisine: Greek / Mediterranean. Protein: chicken breast. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Kung Pao Chicken recipe. Cuisine: Chinese / Sichuan. Protein: chicken breast. Difficulty: Intermediate. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Tandoori Chicken recipe. Cuisine: Indian / Punjabi. Protein: chicken. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Chicken Cacciatore recipe. Cuisine: Italian. Protein: chicken breast. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Low.',

  // Beef (10)
  'Create a high-protein Korean Beef Bulgogi Bowl recipe. Cuisine: Korean. Protein: lean beef sirloin. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Beef Keema with Peas recipe. Cuisine: Indian / North Indian. Protein: lean ground beef. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Steak Fajita Bowl recipe. Cuisine: Mexican. Protein: beef flank steak. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Beef and Broccoli Stir-Fry recipe. Cuisine: Chinese. Protein: lean beef strips. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Lean Beef Bolognese recipe. Cuisine: Italian. Protein: lean ground beef. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Thai Beef Larb Salad recipe. Cuisine: Thai. Protein: lean ground beef. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Beef Kofta Kebab recipe. Cuisine: Middle Eastern. Protein: lean ground beef. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Pepper Steak recipe. Cuisine: American. Protein: beef sirloin. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Lighter Beef Rendang recipe. Cuisine: Indonesian. Protein: lean beef. Difficulty: Intermediate. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Steak with Chimichurri recipe. Cuisine: Argentinian. Protein: beef steak. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',

  // Lamb (10)
  'Create a high-protein Lamb Rogan Josh recipe. Cuisine: Indian / Kashmiri. Protein: lean lamb. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Lamb Keema for Paratha recipe. Cuisine: Indian / North Indian. Protein: lean ground lamb. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Greek Lamb Gyro Bowl recipe. Cuisine: Greek. Protein: lean lamb. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Lamb Kofta Curry recipe. Cuisine: Indian / Mughlai. Protein: lean ground lamb. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Moroccan Lamb Tagine recipe. Cuisine: Moroccan. Protein: lean lamb. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Lamb Chops with Mint recipe. Cuisine: British. Protein: lamb chops. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Lamb Biryani recipe. Cuisine: Indian / Hyderabadi. Protein: lean lamb. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Turkish Lamb Kofte recipe. Cuisine: Turkish. Protein: lean ground lamb. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Lamb Saag recipe. Cuisine: Indian / Punjabi. Protein: lean lamb. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Lamb Stir-Fry with Cumin recipe. Cuisine: Chinese. Protein: lean lamb. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',

  // Goat (10)
  'Create a high-protein Goat Curry Mutton Masala recipe. Cuisine: Indian / South Indian. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Jamaican Curry Goat recipe. Cuisine: Jamaican / Caribbean. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Goat Biryani recipe. Cuisine: Indian / Lucknowi. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Nihari Slow Braised Goat recipe. Cuisine: Indian / Mughlai. Protein: goat shanks. Difficulty: Advanced. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Goat Pepper Fry recipe. Cuisine: Indian / Chettinad. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein West African Goat Stew recipe. Cuisine: West African. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Goat Keema Aloo recipe. Cuisine: Indian / North Indian. Protein: ground goat. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Goat Rara Masala recipe. Cuisine: Indian / Punjabi. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Ethiopian Goat Tibs recipe. Cuisine: Ethiopian. Protein: goat meat. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Rajasthani Laal Maas recipe. Cuisine: Indian / Rajasthani. Protein: goat meat. Difficulty: Intermediate. Meal: lunch/dinner. Spice: High.',

  // Pork (10)
  'Create a high-protein Pork Tenderloin Stir-Fry recipe. Cuisine: Chinese. Protein: pork tenderloin. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Vietnamese Pork Bowl Bun Thit recipe. Cuisine: Vietnamese. Protein: pork tenderloin. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Pulled Pork Lettuce Wraps recipe. Cuisine: American. Protein: pork tenderloin. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Pork Adobo recipe. Cuisine: Filipino. Protein: lean pork. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Lighter Char Siu Pork recipe. Cuisine: Chinese / Cantonese. Protein: pork tenderloin. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Pork Larb recipe. Cuisine: Thai. Protein: lean ground pork. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Baked Tonkatsu Pork Cutlet recipe. Cuisine: Japanese. Protein: pork tenderloin. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Pork Vindaloo recipe. Cuisine: Indian / Goan. Protein: lean pork. Difficulty: Intermediate. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Korean Spicy Pork Jeyuk Bokkeum recipe. Cuisine: Korean. Protein: lean pork. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Pork Carnitas Bowl recipe. Cuisine: Mexican. Protein: pork tenderloin. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',

  // Fish (12)
  'Create a high-protein Salmon Teriyaki Bowl recipe. Cuisine: Japanese. Protein: salmon fillet. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Fish Moilee Kerala Curry recipe. Cuisine: Indian / Kerala. Protein: white fish fillet. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Grilled Tilapia with Mango Salsa recipe. Cuisine: Caribbean. Protein: tilapia. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Tandoori Salmon recipe. Cuisine: Indian Fusion. Protein: salmon fillet. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Thai Fish Panang Curry recipe. Cuisine: Thai. Protein: white fish fillet. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Baked Cod with Herbs recipe. Cuisine: Mediterranean. Protein: cod fillet. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Fish Tacos with Slaw recipe. Cuisine: Mexican. Protein: white fish fillet. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Bengali Fish Curry Machher Jhol recipe. Cuisine: Indian / Bengali. Protein: fish fillet. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Miso Glazed Salmon recipe. Cuisine: Japanese. Protein: salmon fillet. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Pan Seared Sea Bass with Lemon recipe. Cuisine: French / Mediterranean. Protein: sea bass. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Goan Fish Recheado recipe. Cuisine: Indian / Goan. Protein: fish fillet. Difficulty: Intermediate. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Tuna Poke Bowl recipe. Cuisine: Hawaiian. Protein: fresh tuna. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',

  // Prawns (10)
  'Create a high-protein Garlic Butter Prawns recipe. Cuisine: Mediterranean. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Prawn Masala recipe. Cuisine: Indian / South Indian. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Thai Prawn Pad Thai recipe. Cuisine: Thai. Protein: prawns. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Kung Pao Shrimp recipe. Cuisine: Chinese. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Prawn Biryani recipe. Cuisine: Indian / Hyderabadi. Protein: prawns. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Mexican Shrimp Bowl recipe. Cuisine: Mexican. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Kerala Prawn Curry recipe. Cuisine: Indian / Kerala. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Prawn Stir-Fry with Black Pepper recipe. Cuisine: Indian / Chettinad. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Cajun Shrimp Skillet recipe. Cuisine: American / Cajun. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Vietnamese Prawn Rice Paper Rolls recipe. Cuisine: Vietnamese. Protein: prawns. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',

  // Eggs (12)
  'Create a high-protein Egg Bhurji Spicy Scramble recipe. Cuisine: Indian. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Spice: Medium.',
  'Create a high-protein Shakshuka recipe. Cuisine: Middle Eastern. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Spice: Medium.',
  'Create a high-protein Protein Loaded Spanish Tortilla recipe. Cuisine: Spanish. Protein: eggs. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Egg Fried Rice recipe. Cuisine: Chinese. Protein: eggs. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Turkish Menemen recipe. Cuisine: Turkish. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Spice: Medium.',
  'Create a high-protein Egg Curry Anda Masala recipe. Cuisine: Indian / North Indian. Protein: eggs. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Korean Steamed Egg Gyeran-jjim recipe. Cuisine: Korean. Protein: eggs. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Vegetable Frittata recipe. Cuisine: Italian. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Baked Scotch Eggs recipe. Cuisine: British. Protein: eggs and ground chicken. Difficulty: Intermediate. Meal: snack. Spice: Low.',
  'Create a high-protein Egg Drop Soup recipe. Cuisine: Chinese. Protein: eggs. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Omelette with Spinach and Feta recipe. Cuisine: Greek. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Egg Dosa with Chutney recipe. Cuisine: Indian / South Indian. Protein: eggs. Difficulty: Beginner. Meal: breakfast. Spice: Medium.',

  // Paneer (12)
  'Create a high-protein Palak Paneer recipe. Cuisine: Indian / North Indian. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Paneer Tikka Masala recipe. Cuisine: Indian / North Indian. Protein: paneer. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Kadai Paneer recipe. Cuisine: Indian / Punjabi. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Paneer Bhurji recipe. Cuisine: Indian. Protein: paneer. Difficulty: Beginner. Meal: breakfast. Spice: Medium.',
  'Create a high-protein Lighter Paneer Butter Masala recipe. Cuisine: Indian / North Indian. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low. Use Greek yogurt instead of cream.',
  'Create a high-protein Shahi Paneer recipe. Cuisine: Indian / Mughlai. Protein: paneer. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Paneer Stir-Fry with Peppers recipe. Cuisine: Indo-Chinese. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Matar Paneer recipe. Cuisine: Indian / North Indian. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Paneer Tikka Wrap recipe. Cuisine: Indian Fusion. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Paneer Jalfrezi recipe. Cuisine: Indian / British-Indian. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Paneer Biryani recipe. Cuisine: Indian / Hyderabadi. Protein: paneer. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Achari Paneer recipe. Cuisine: Indian / Rajasthani. Protein: paneer. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',

  // Tofu (10)
  'Create a high-protein Mapo Tofu recipe. Cuisine: Chinese / Sichuan. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Tofu Tikka Masala recipe. Cuisine: Indian Vegan. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Thai Basil Tofu Stir-Fry recipe. Cuisine: Thai. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Korean Sundubu Jjigae Soft Tofu Stew recipe. Cuisine: Korean. Protein: soft tofu. Difficulty: Beginner. Meal: lunch/dinner. Spice: High.',
  'Create a high-protein Tofu Scramble with Vegetables recipe. Cuisine: American. Protein: firm tofu. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Crispy Tofu Pad Thai recipe. Cuisine: Thai. Protein: firm tofu. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Japanese Agedashi Tofu recipe. Cuisine: Japanese. Protein: firm tofu. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Tofu Palak recipe. Cuisine: Indian. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Vietnamese Tofu Bun Bowl recipe. Cuisine: Vietnamese. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Tofu and Broccoli in Black Bean Sauce recipe. Cuisine: Chinese. Protein: firm tofu. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',

  // Soy/Beans/Lentils (10)
  'Create a high-protein Dal Tadka Yellow Lentil recipe. Cuisine: Indian / North Indian. Protein: yellow lentils. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Chana Masala Chickpea Curry recipe. Cuisine: Indian / Punjabi. Protein: chickpeas. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Black Bean Burrito Bowl recipe. Cuisine: Mexican. Protein: black beans. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Soy Chunk Keema recipe. Cuisine: Indian. Protein: soy chunks. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Rajma Kidney Bean Curry recipe. Cuisine: Indian / Punjabi. Protein: kidney beans. Difficulty: Beginner. Meal: lunch/dinner. Spice: Medium.',
  'Create a high-protein Lentil Soup Shorba recipe. Cuisine: Middle Eastern. Protein: red lentils. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Edamame Stir-Fry recipe. Cuisine: Japanese. Protein: edamame. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Brazilian Black Bean Stew Feijoada Lite recipe. Cuisine: Brazilian. Protein: black beans. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Low.',
  'Create a high-protein Lighter Dal Makhani recipe. Cuisine: Indian / Punjabi. Protein: black lentils. Difficulty: Intermediate. Meal: lunch/dinner. Spice: Medium. Use Greek yogurt instead of cream.',
  'Create a high-protein Chickpea and Spinach Curry recipe. Cuisine: Mediterranean. Protein: chickpeas. Difficulty: Beginner. Meal: lunch/dinner. Spice: Low.',

  // Milk/Dairy (10)
  'Create a high-protein Mango Lassi recipe. Cuisine: Indian. Protein: Greek yogurt and milk. Difficulty: Beginner. Meal: snack. Spice: Low.',
  'Create a high-protein Greek Yogurt Parfait recipe. Cuisine: American. Protein: Greek yogurt. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Chocolate Peanut Butter Protein Shake recipe. Cuisine: American. Protein: milk and peanut butter. Difficulty: Beginner. Meal: snack. Spice: Low.',
  'Create a high-protein Berry Protein Smoothie Bowl recipe. Cuisine: American. Protein: Greek yogurt and milk. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Masala Chaas Spiced Buttermilk recipe. Cuisine: Indian. Protein: buttermilk and yogurt. Difficulty: Beginner. Meal: snack. Spice: Low.',
  'Create a high-protein Banana Oat Protein Shake recipe. Cuisine: American. Protein: milk. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Turmeric Golden Milk Protein Boosted recipe. Cuisine: Indian. Protein: milk and Greek yogurt. Difficulty: Beginner. Meal: snack. Spice: Low.',
  'Create a high-protein Strawberry Cheesecake Smoothie recipe. Cuisine: American. Protein: Greek yogurt and milk. Difficulty: Beginner. Meal: snack. Spice: Low.',
  'Create a high-protein Coffee Protein Shake Mocha recipe. Cuisine: American. Protein: milk. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Mint Chocolate Protein Smoothie recipe. Cuisine: American. Protein: milk and Greek yogurt. Difficulty: Beginner. Meal: snack. Spice: Low.',

  // Whey/Protein Powder (10)
  'Create a high-protein Whey Protein Pancakes recipe. Cuisine: American. Protein: whey protein powder. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Protein Overnight Oats recipe. Cuisine: American. Protein: whey protein powder and Greek yogurt. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Peanut Butter Protein Balls recipe. Cuisine: American. Protein: whey protein powder. Difficulty: Beginner. Meal: snack. Spice: Low.',
  'Create a high-protein Protein Banana Bread recipe. Cuisine: American. Protein: whey protein powder. Difficulty: Intermediate. Meal: snack. Spice: Low.',
  'Create a high-protein Chocolate Protein Mousse recipe. Cuisine: French. Protein: whey protein powder. Difficulty: Beginner. Meal: dessert. Spice: Low.',
  'Create a high-protein Protein Cookie Dough Bites recipe. Cuisine: American. Protein: whey protein powder. Difficulty: Beginner. Meal: snack. Spice: Low.',
  'Create a high-protein Whey Protein Waffles recipe. Cuisine: American. Protein: whey protein powder. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Protein Chia Pudding recipe. Cuisine: American. Protein: whey protein powder and Greek yogurt. Difficulty: Beginner. Meal: breakfast. Spice: Low.',
  'Create a high-protein Coffee Protein Ice Cream recipe. Cuisine: American. Protein: whey protein powder. Difficulty: Beginner. Meal: dessert. Spice: Low.',
  'Create a high-protein Protein Granola Bars recipe. Cuisine: American. Protein: whey protein powder. Difficulty: Beginner. Meal: snack. Spice: Low.',
];

console.log(`Total recipes: ${recipes.length}`);
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([['Prompt'], ...recipes.map(r => [r])]);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const outPath = path.join(__dirname, '..', 'Recipes', 'prompts', 'batch_137.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Prompts file created: ${outPath}`);
