// Backend/models/ActivityLog.js
const mongoose = require("mongoose");

const ActivityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: ""
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  modelName: {
    type: String,
    default: ""
  },
  partName: {
    type: String,
    default: ""
  },
  widgetType: {
    type: String,
    default: ""
  },
  visibility: {
    type: String,
    enum: ["user", "admin", "public"],
    default: "user"
  }
}, {
  timestamps: true
});

// Index for better query performance
ActivityLogSchema.index({ userId: 1, timestamp: -1 });
ActivityLogSchema.index({ userEmail: 1, timestamp: -1 });
ActivityLogSchema.index({ visibility: 1 });

module.exports = mongoose.model("ActivityLog", ActivityLogSchema);