const fs = require('fs');
const path = require('path');

/**
 * Write a config JSON file for a model in the public/configs folder.
 * @param {string} modelName - The model's name (used for filename).
 * @param {object} configObj - The config object to write.
 * @returns {string} The relative path to the config file.
 */
function writeModelConfig(modelName, configObj) {
  const configsDir = path.join(__dirname, '../../Frontend/public/configs');
  if (!fs.existsSync(configsDir)) {
    fs.mkdirSync(configsDir, { recursive: true });
  }
  // Use timestamp and model name for uniqueness
  const filename = `config-${Date.now()}-${Math.floor(Math.random()*1e8)}-${modelName}.json`;
  const filePath = path.join(configsDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(configObj, null, 2), 'utf8');
  // Return relative path for storage/reference
  return `/configs/${filename}`;
}

module.exports = { writeModelConfig };
