const fs = require("fs");
const path = require("path");

const targets = [
  ".turbo",
  "apps/api/dist",
  "apps/api/.turbo",
  "apps/web/.next",
  "apps/web/.turbo",
  "packages/ai-gateway/dist",
  "packages/ai-gateway/.turbo",
  "packages/country-pack/dist",
  "packages/country-pack/.turbo",
  "packages/database/dist",
  "packages/database/.turbo",
  "packages/financial-core/dist",
  "packages/financial-core/.turbo",
  "packages/shared-types/dist",
  "packages/shared-types/.turbo",
];

const rootDir = path.join(__dirname, "..");

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

console.log("Cleaning build artifacts...");
targets.forEach((target) => {
  const fullPath = path.join(rootDir, target);
  if (fs.existsSync(fullPath)) {
    try {
      deleteFolderRecursive(fullPath);
      console.log(`Deleted: ${target}`);
    } catch (err) {
      console.error(`Failed to delete ${target}:`, err.message);
    }
  }
});
console.log("Clean complete!");
