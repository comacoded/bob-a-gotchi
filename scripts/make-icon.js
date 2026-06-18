// Builds the 128x128 Marketplace icon: Bob trimmed and nearest-neighbor
// upscaled onto a dark IBM-blue card. Run: node scripts/make-icon.js
const sharp = require("sharp");
const path = require("path");

const media = path.join(__dirname, "..", "media");

(async () => {
  const sprite = await sharp(path.join(media, "sprites", "south.png"))
    .trim()
    .resize(96, 96, {
      fit: "contain",
      kernel: "nearest",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const bg = Buffer.from(
    `<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="#16213e"/>
           <stop offset="1" stop-color="#0b1020"/>
         </linearGradient>
       </defs>
       <rect width="128" height="128" rx="24" fill="url(#g)"/>
     </svg>`
  );

  await sharp(bg)
    .composite([{ input: sprite, top: 24, left: 16 }])
    .png()
    .toFile(path.join(media, "icon.png"));

  console.log("wrote media/icon.png");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
