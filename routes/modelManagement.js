const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// GET /api/models/:modelName/assets
router.get('/api/models/:modelName/assets', (req, res) => {
  const { modelName } = req.params;
  const modelsDir = path.join(__dirname, '../../Frontend/public/models');
  fs.readdir(modelsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read models directory' });
    }
    // Filter for .glb files containing the modelName (case-insensitive)
    const modelNameLower = modelName.toLowerCase();
    const assetFiles = files.filter(f => f.toLowerCase().endsWith('.glb') && f.toLowerCase().includes(modelNameLower));
    res.json(assetFiles);
  });
});

module.exports = router;
