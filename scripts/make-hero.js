// Builds media/preview.png: a 640x320 hero for the README / Marketplace page.
// Run: node scripts/make-hero.js
const sharp = require("sharp");
const path = require("path");

const media = path.join(__dirname, "..", "media");
const W = 640;
const H = 320;

(async () => {
  const bob = await sharp(path.join(media, "sprites", "south.png"))
    .trim()
    .resize(220, 220, {
      fit: "contain",
      kernel: "nearest",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const bg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="#1a2547"/>
           <stop offset="1" stop-color="#090d18"/>
         </linearGradient>
       </defs>
       <rect width="${W}" height="${H}" fill="url(#g)"/>
       <rect x="372" y="40" width="240" height="240" rx="20" fill="#ffffff" opacity="0.04"/>
       <text x="44" y="118" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff">Bob the</text>
       <text x="44" y="166" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#5d7bff">Build Buddy</text>
       <text x="46" y="206" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="16" fill="#aab4d4">A pixel robot who codes along, cheers your</text>
       <text x="46" y="228" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="16" fill="#aab4d4">AI's big commits, and naps when you idle.</text>
       <text x="46" y="276" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13" fill="#7f8ab0">Feed him.  Keep him happy.  Ship code.</text>
     </svg>`
  );

  await sharp(bg)
    .composite([{ input: bob, top: 50, left: 382 }])
    .png()
    .toFile(path.join(media, "preview.png"));

  console.log("wrote media/preview.png");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
