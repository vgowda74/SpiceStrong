const path = require('path');
const XLSX = require('xlsx');

const headers = [
  'id', 'name', 'protein_id', 'protein_name', 'protein_emoji',
  'description', 'chef_tip', 'meal_type', 'time_minutes', 'difficulty',
  'protein_per_100g', 'spice_level', 'cuisine', 'gradient_start', 'gradient_end',
  'ingredients_small', 'ingredients_large', 'steps',
  'calories', 'proteinG', 'fatG', 'carbsG', 'fiberG', 'sugarG', 'sodiumMg',
  'cholesterolMg', 'saturatedFatG', 'ironMg', 'calciumMg',
  'image_filename', 'step_0_image', 'step_1_image', 'step_2_image',
  'step_3_image', 'step_4_image',
];

const recipe = {
  id: 'curated-pork-pepper-pork-fry',
  name: 'Indian Pepper Pork Fry',
  protein_id: 'pork',
  protein_name: 'Pork',
  protein_emoji: '🥩',
  description: 'A flavorful South Indian-style pork fry made with onions, garlic, ginger, curry leaves, and freshly ground black pepper. The pork is slowly cooked with spices until tender and then pan-roasted to develop a rich, peppery crust.',
  chef_tip: '32g protein | 380 kcal | 40 min cook. Pork releases its own fat while cooking — use it to build flavor instead of adding extra oil.',
  meal_type: 'lunch_dinner',
  time_minutes: 40,
  difficulty: 'Medium',
  protein_per_100g: 27,
  spice_level: 'medium',
  cuisine: 'indian',
  gradient_start: '#4A1A0A',
  gradient_end: '#8B3A1A',
  ingredients_small: JSON.stringify([
    { name: 'Pork (boneless, small cubes)', quantity: '400 g' },
    { name: 'Onion (sliced)', quantity: '1 Medium' },
    { name: 'Ginger Garlic Paste', quantity: '1 tbsp' },
    { name: 'Green Chilies (slit)', quantity: '2' },
    { name: 'Curry Leaves', quantity: '10-12' },
    { name: 'Freshly Ground Black Pepper', quantity: '1.5 tsp' },
    { name: 'Kashmiri Chili Powder', quantity: '1 tsp' },
    { name: 'Turmeric Powder', quantity: '1/4 tsp' },
    { name: 'Coriander Powder', quantity: '1 tsp' },
    { name: 'Garam Masala', quantity: '1/2 tsp' },
    { name: 'Fennel Powder', quantity: '1/2 tsp' },
    { name: 'Cooking Oil (coconut oil preferred)', quantity: '1.5 tbsp' },
    { name: 'Salt', quantity: '3/4 tsp' },
    { name: 'Lemon Juice', quantity: '1 tbsp' },
    { name: 'Fresh Cilantro (optional garnish)', quantity: '2 tbsp' },
  ]),
  ingredients_large: JSON.stringify([
    { name: 'Pork (boneless, small cubes)', quantity: '800 g' },
    { name: 'Onion (sliced)', quantity: '2 Medium' },
    { name: 'Ginger Garlic Paste', quantity: '2 tbsp' },
    { name: 'Green Chilies (slit)', quantity: '3-4' },
    { name: 'Curry Leaves', quantity: '20' },
    { name: 'Freshly Ground Black Pepper', quantity: '3 tsp' },
    { name: 'Kashmiri Chili Powder', quantity: '2 tsp' },
    { name: 'Turmeric Powder', quantity: '1/2 tsp' },
    { name: 'Coriander Powder', quantity: '2 tsp' },
    { name: 'Garam Masala', quantity: '1 tsp' },
    { name: 'Fennel Powder', quantity: '1 tsp' },
    { name: 'Cooking Oil (coconut oil preferred)', quantity: '3 tbsp' },
    { name: 'Salt', quantity: '1.5 tsp' },
    { name: 'Lemon Juice', quantity: '2 tbsp' },
    { name: 'Fresh Cilantro (optional garnish)', quantity: '4 tbsp' },
  ]),
  steps: JSON.stringify([
    { title: 'Season the Pork', description: 'In a bowl combine pork with turmeric, chili powder, coriander powder, half the black pepper, and salt. Mix well.', emoji: '🥩', tip: 'Let the pork marinate for 15 minutes for better flavor absorption.' },
    { title: 'Cook the Pork', description: 'Add the seasoned pork to a pan with a small splash of water. Cover and cook until the pork becomes tender.', emoji: '🔥', timerMinutes: 25, tip: 'Pork releases its own fat while cooking, which adds flavor.' },
    { title: 'Cook Aromatics', description: 'Add oil, sliced onions, ginger garlic paste, green chilies, and curry leaves. Cook until onions soften.', emoji: '🧅', timerMinutes: 5, tip: 'Coconut oil gives an authentic South Indian aroma.' },
    { title: 'Roast the Pork', description: 'Cook uncovered while stirring occasionally until the pork begins to brown and the masala thickens.', emoji: '🌶️', timerMinutes: 10, tip: 'High heat at this stage creates the signature crispy edges.' },
    { title: 'Finish the Fry', description: 'Add remaining black pepper, garam masala, fennel powder, and lemon juice. Toss well and cook for another minute. Garnish with cilantro and serve hot.', emoji: '🌿', timerMinutes: 1, tip: 'Adding pepper at the end preserves its bold aroma and heat.' },
  ]),
  calories: 380,
  proteinG: 32,
  fatG: 25,
  carbsG: 6,
  fiberG: 2,
  sugarG: 2,
  sodiumMg: 520,
  cholesterolMg: 95,
  saturatedFatG: 9,
  ironMg: 3,
  calciumMg: 40,
  image_filename: '',
  step_0_image: '',
  step_1_image: '',
  step_2_image: '',
  step_3_image: '',
  step_4_image: '',
};

const data = [
  headers,
  headers.map(h => (recipe[h] !== undefined ? recipe[h] : '')),
];

const ws = XLSX.utils.aoa_to_sheet(data);

ws['!cols'] = [
  { wch: 38 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 6 },
  { wch: 50 }, { wch: 50 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
  { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  { wch: 60 }, { wch: 60 }, { wch: 80 },
  { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
  { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
  { wch: 22 }, { wch: 24 }, { wch: 24 }, { wch: 24 },
  { wch: 24 }, { wch: 24 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Recipes');

const output = path.resolve(__dirname, '..', 'recipes', 'input', 'pepper_pork_fry.xlsx');
XLSX.writeFile(wb, output);
console.log('Generated:', output);
