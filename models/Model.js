const mongoose = require('mongoose');

const ModelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  displayName: { type: String },
  path: { type: String, required: true },
  file: { type: String },
  configUrl: { type: String },
  section: { type: String, required: false, default: 'Upright Counter' },
  type: { type: String },
  status: { type: String, default: 'active' },
  assets: { type: mongoose.Schema.Types.Mixed },
  metadata: { type: mongoose.Schema.Types.Mixed },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  camera: { type: mongoose.Schema.Types.Mixed },
  lights: { type: [mongoose.Schema.Types.Mixed], default: [] },
  hiddenInitially: { type: [String], default: [] },
  uiWidgets: { type: [mongoose.Schema.Types.Mixed], default: [] },
  presets: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('Model', ModelSchema);
