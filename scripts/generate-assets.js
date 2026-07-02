const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ASSETS_DIR = path.resolve(__dirname, "../apps/web/public/assets");

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

const assets = [
  {
    name: "logo_mark.png",
    prompt:
      "A sleek, abstract, minimalist geometric logo mark for a high-end quantitative real estate investment terminal, metallic dark slate and emerald green colors, premium SaaS branding, vector icon style, isolated on solid black background.",
  },
  {
    name: "no_deals.png",
    prompt:
      "A clean, premium, minimalist vector-style empty state illustration of a real estate market search with zero results, an abstract magnifying glass over a stylized map grid, dark slate and emerald green colors, isolated on solid dark background, luxury UI asset.",
  },
  {
    name: "no_portfolio.png",
    prompt:
      "A clean, premium, minimalist vector-style empty state illustration of an empty financial ledger or real estate portfolio, an abstract empty vault or folder with charts at zero, dark slate and emerald green colors, isolated on solid dark background, luxury UI asset.",
  },
  {
    name: "no_documents.png",
    prompt:
      "A clean, premium, minimalist vector-style empty state illustration of an empty document safe, abstract empty paper sheets or document icons, dark slate and emerald green colors, isolated on solid dark background, luxury UI asset.",
  },
];

async function downloadFile(url, dest) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
}

async function run() {
  for (const asset of assets) {
    const destPath = path.join(ASSETS_DIR, asset.name);
    if (fs.existsSync(destPath)) {
      continue;
    }

    try {
      const command = `npx -p @higgsfield/cli higgsfield generate create gpt_image_2 --prompt "${asset.prompt}" --wait`;
      const output = execSync(command, { encoding: "utf-8" }).trim();

      const lines = output.split("\n");
      const url = lines[lines.length - 1].trim();

      if (url.startsWith("http")) {
        await downloadFile(url, destPath);
      } else {
        throw new Error(`Invalid output: ${output}`);
      }
    } catch (err) {
      process.exit(1);
    }
  }
}

run();
