const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// PUT /api/configs/:filename - Overwrite an existing config file
router.put('/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
  // If this isn't a file-based request (e.g. it's a Mongo _id), let higher-level routes handle it
  if (!filename.endsWith('.json')) return next();
    const configsDir = path.join(__dirname, '../../Frontend/public/configs');
    const filePath = path.join(configsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Config file not found' });
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ message: 'Config updated', path: `/configs/${filename}` });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update config', error: err.message });
  }
});

// DELETE /api/configs/:filename - Remove a config file
router.delete('/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
  // If the param isn't a .json filename, this router shouldn't handle it.
  // Call next() so the DB-backed routes in server.js can match (e.g., DELETE by Mongo _id).
  if (!filename.endsWith('.json')) return next();
    const configsDir = path.join(__dirname, '../../Frontend/public/configs');
    const filePath = path.join(configsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Config file not found' });
    fs.unlinkSync(filePath);
    res.json({ message: 'Config deleted', path: `/configs/${filename}` });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete config', error: err.message });
  }
});

module.exports = router;
