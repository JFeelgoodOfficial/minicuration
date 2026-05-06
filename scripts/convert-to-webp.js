const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.join(__dirname, '..', 'image');
const SPIN_DIR = path.join(IMAGE_DIR, 'spin');

async function convertDir(dir) {
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  for (const file of files) {
    const src = path.join(dir, file);
    const dest = path.join(dir, file.replace(/\.(jpg|jpeg|png)$/i, '.webp'));
    if (fs.existsSync(dest)) { console.log(`skip  ${file}`); continue; }
    try {
      await sharp(src).webp({ quality: 82, effort: 6 }).toFile(dest);
      console.log(`ok    ${file} → ${path.basename(dest)}`);
    } catch (err) {
      console.error(`fail  ${file}: ${err.message}`);
    }
  }
}

(async () => {
  console.log('=== /image/ ===');
  await convertDir(IMAGE_DIR);
  console.log('=== /image/spin/ ===');
  await convertDir(SPIN_DIR);
  console.log('Done.');
})();
