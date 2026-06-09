/**
 * seed-scan-instructions.js
 * One-time script: generates 8 body-scan instruction images via fal.ai and
 * uploads them to Supabase Storage bucket `scan-instructions`.
 *
 * Run once:
 *   node scripts/seed-scan-instructions.js
 *
 * Requires in .env (or environment):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service role — NOT the anon key)
 *   EXPO_PUBLIC_FAL_KEY
 */

require('dotenv').config({ path: '.env' });
const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FAL_KEY = process.env.EXPO_PUBLIC_FAL_KEY;
const BUCKET = 'scan-instructions';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FAL_KEY) {
  console.error('Missing env vars. Need EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_FAL_KEY');
  process.exit(1);
}

const PROMPTS = {
  clothingGood: 'Fitness body scan reference photo. Athletic man wearing only fitted black compression shorts, shirtless, standing straight facing camera, arms slightly away from sides, full body visible from head to feet, plain light gray wall background, soft bright natural lighting, professional portrait photography, crisp detail, no text',
  clothingBad: 'Fitness body scan bad example. Same man but wearing an oversized baggy gray hoodie and very loose sweatpants, full body facing camera, same plain gray wall, same bright lighting, body shape completely hidden by loose baggy clothing, portrait photo',
  lightingGood: 'Fitness body scan reference photo. Shirtless athletic man in black compression shorts facing camera against white wall, perfectly lit with soft even diffused natural window light, no harsh shadows, bright and clear, high quality portrait, full body visible',
  lightingBad: 'Fitness body scan bad example. Same shirtless man in black shorts facing camera but in a dark poorly lit room, single harsh side shadow obscuring half the body, underexposed dark image, barely visible details',
  backgroundGood: 'Fitness body scan reference photo. Shirtless athletic man in black shorts standing facing camera in front of a perfectly clean plain white wall, zero clutter, minimal neutral background, ideal for body composition analysis',
  backgroundBad: 'Fitness body scan bad example. Same shirtless man in gym shorts standing in a very cluttered busy room with messy furniture, shelves, curtains visible behind him, very distracting background',
  distanceGood: 'Fitness body scan reference photo. Full body shot of shirtless athletic man in gym shorts, standing 6 to 8 feet from camera, complete body perfectly framed from top of head to feet with slight margin, properly proportioned, clean wall background',
  distanceBad: 'Fitness body scan bad example. Same man shirtless in gym shorts but standing far too close to camera, only chest and shoulders visible in frame, waist and legs completely cut off',
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function generateViaFal(prompt, label) {
  console.log(`  Generating ${label}...`);
  const submitRes = await fetch(`https://queue.fal.run/fal-ai/flux/schnell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_KEY}` },
    body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1, enable_safety_checker: false }),
  });
  if (!submitRes.ok) throw new Error(`fal.ai submit ${submitRes.status}`);
  const submitData = await submitRes.json();
  if (submitData.images?.[0]?.url) return submitData.images[0].url;

  const responseUrl = submitData.response_url;
  if (!responseUrl) throw new Error('No response_url');

  for (let i = 0; i < 30; i++) {
    await delay(2000);
    const poll = await fetch(responseUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    if (!poll.ok) continue;
    const data = await poll.json();
    if (data.images?.[0]?.url) return data.images[0].url;
  }
  throw new Error(`Timed out generating ${label}`);
}

async function uploadToSupabase(key, buffer) {
  const path = `${key}.jpg`;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upload ${res.status}: ${err}`);
  }
  console.log(`  ✓ Uploaded ${path}`);
}

async function ensureBucketExists() {
  // Check if bucket exists
  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (listRes.status === 200) {
    console.log(`Bucket '${BUCKET}' already exists.`);
    return;
  }
  // Create it with public access
  const createRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Could not create bucket: ${err}`);
  }
  console.log(`Created public bucket '${BUCKET}'.`);
}

async function main() {
  console.log('=== Seeding scan instruction images to Supabase Storage ===\n');

  await ensureBucketExists();

  const keys = Object.keys(PROMPTS);
  for (const key of keys) {
    console.log(`\n[${key}]`);
    try {
      const imageUrl = await generateViaFal(PROMPTS[key], key);
      const buffer = await downloadBuffer(imageUrl);
      await uploadToSupabase(key, buffer);
    } catch (err) {
      console.error(`  ✗ Failed ${key}: ${err.message}`);
    }
  }

  console.log('\n=== Done. Images are now at:');
  console.log(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/{key}.jpg\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
