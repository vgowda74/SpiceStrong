import sharp from 'sharp';

const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="180" fill="#E85D26"/>
  <circle cx="512" cy="512" r="380" fill="#1A1A1A"/>
  <text x="512" y="640" font-size="380" text-anchor="middle" font-family="Arial">💪</text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .png()
  .toFile('assets/images/icon.png');

console.log('Icon saved!');