// Backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ActivityLog = require("./models/ActivityLog");
require("dotenv").config();

const app = express();

// Helper to safely extract client IP (supports proxies if X-Forwarded-For present)
function getClientIp(req) {
  try {
    const xf = req.headers['x-forwarded-for'];
    if (xf) {
      // X-Forwarded-For may contain multiple IPs: client, proxy1, proxy2
      const parts = xf.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length) return parts[0];
    }
    return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '0.0.0.0';
  } catch (e) {
    return '0.0.0.0';
  }
}

// Middleware - Updated with your IP
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",  // New port
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",  // New port
    "http://192.168.1.5:5173", // Current frontend IP
    "http://192.168.1.5:5174", // Current frontend IP on new port
    "http://192.168.1.5:5000", // Backend on same IP
    "http://192.168.1.7:5173", // Your IP
    "http://192.168.1.7:5174", // Your IP on new port
    "http://192.168.1.7:3000"  // Your IP
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json({ limit: '50mb' })); // Increase JSON payload limit for configurations
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Also increase URL-encoded limit

// Serve uploaded models statically from backend
app.use('/models', express.static(path.join(__dirname, '../Frontend/public/models')));
// Serve textures statically from backend  
app.use('/textures', express.static(path.join(__dirname, '../Frontend/public/textures')));
app.use('/texture', express.static(path.join(__dirname, '../Frontend/public/texture')));
// Serve developer-provided JSON configs
app.use('/configs', express.static(path.join(__dirname, '../Frontend/public/configs')));

// Connect to MongoDB
const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017/3dconfigurator";

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// User Model
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "user", enum: ["admin", "user"] },
  permissions: {
    doorPresets: { type: Boolean, default: false },
    doorToggles: { type: Boolean, default: false },
    drawerToggles: { type: Boolean, default: false },
    textureWidget: { type: Boolean, default: false },
    lightWidget: { type: Boolean, default: false },
    globalTextureWidget: { type: Boolean, default: false },
    // Add missing widget permissions
    reflectionWidget: { type: Boolean, default: false },
    movementWidget: { type: Boolean, default: false },
    customWidget: { type: Boolean, default: false },
    saveConfig: { type: Boolean, default: false },
    canRotate: { type: Boolean, default: true },
    canPan: { type: Boolean, default: false },
    canZoom: { type: Boolean, default: false },
    canMove: { type: Boolean, default: false }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);

// Model Schema for Admin Panel
const ModelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  displayName: { type: String, required: true },
  file: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  // External developer-provided config JSON URL or path (e.g., '/configs/xyz.json' or full http URL)
  configUrl: { type: String },
  interactionGroups: mongoose.Schema.Types.Mixed,
  metadata: mongoose.Schema.Types.Mixed,
  // Add explicit fields for configuration data
  camera: mongoose.Schema.Types.Mixed,
  lights: mongoose.Schema.Types.Mixed,
  hiddenInitially: mongoose.Schema.Types.Mixed,
  uiWidgets: mongoose.Schema.Types.Mixed,
  assets: mongoose.Schema.Types.Mixed,
  presets: mongoose.Schema.Types.Mixed,
  // Model positioning fields
  modelPosition: { type: [Number], default: [0, 0, 0] },
  modelRotation: { type: [Number], default: [0, 0, 0] },
  modelScale: { type: Number, default: 2 },
  // Simplified placement mode (autofit = autoFitModel, focused = keep model origin and only set camera)
  placementMode: { type: String, enum: ['autofit', 'focused'], default: 'autofit' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const Model = mongoose.model("Model", ModelSchema);

// SavedConfiguration Schema for user configurations
const SavedConfigurationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  modelName: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  configData: {
    // Model state data
    doorConfiguration: mongoose.Schema.Types.Mixed,  // Which doors are open/closed
    textureSettings: mongoose.Schema.Types.Mixed,    // Applied textures (with file paths)
    cameraPosition: mongoose.Schema.Types.Mixed,     // Camera state
    widgetStates: mongoose.Schema.Types.Mixed,       // Widget configurations
    visibilityStates: mongoose.Schema.Types.Mixed,   // What's visible/hidden
    customizations: mongoose.Schema.Types.Mixed      // Any other custom settings
  },
  textureFiles: [{                                   // Array of texture files for this config
    originalName: String,                            // Original filename from user
    savedPath: String,                               // Path where file is stored
    configKey: String,                               // Key in textureSettings this file corresponds to
    fileSize: Number,                                // File size in bytes
    mimeType: String,                                // MIME type of the file
    uploadedAt: { type: Date, default: Date.now }   // When texture was uploaded
  }],
  isPublic: { type: Boolean, default: false },      // For sharing configs
  tags: [String],                                    // For categorizing configs
  previewImage: String                               // Optional screenshot
}, { timestamps: true });

const SavedConfiguration = mongoose.model("SavedConfiguration", SavedConfigurationSchema);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../Frontend/public/models');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: function (req, file, cb) {
    // Accept only GLB/GLTF files
    const allowedTypes = ['.glb', '.gltf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only GLB and GLTF files are allowed'), false);
    }
  }
});

// Configure multer for texture uploads
const textureStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../Frontend/public/texture');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'texture-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadTexture = multer({ 
  storage: textureStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for textures
  fileFilter: function (req, file, cb) {
    // Accept only image files
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, BMP, TIFF, WebP) are allowed'), false);
    }
  }
});

// Utility function to copy texture files for configuration storage
async function copyTextureForConfig(sourcePath, configId, textureKey) {
  try {
    console.log(`📂 copyTextureForConfig called with:`, { sourcePath, configId, textureKey });
    
    const configTexturesPath = path.join(__dirname, '../Frontend/public/config-textures', configId);
    console.log(`📂 Config textures path: ${configTexturesPath}`);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(configTexturesPath)) {
      fs.mkdirSync(configTexturesPath, { recursive: true });
      console.log(`📂 Created directory: ${configTexturesPath}`);
    }
    
    const sourceFullPath = path.join(__dirname, '../Frontend/public', sourcePath);
    const filename = `${textureKey}-${path.basename(sourcePath)}`;
    const destinationPath = path.join(configTexturesPath, filename);
    
    console.log(`📂 Source path: ${sourceFullPath}`);
    console.log(`📂 Destination path: ${destinationPath}`);
    
    // Check if source file exists
    if (!fs.existsSync(sourceFullPath)) {
      throw new Error(`Source texture file not found: ${sourceFullPath}`);
    }
    
    // Copy the file
    await fs.promises.copyFile(sourceFullPath, destinationPath);
    console.log(`✅ File copied successfully`);
    
    // Return the relative path for frontend access
    const relativePath = `/config-textures/${configId}/${filename}`;
    console.log(`📂 Returning relative path: ${relativePath}`);
    return relativePath;
  } catch (error) {
    console.error('❌ Error copying texture file:', error);
    throw error;
  }
}

// Utility function to clean up texture files when configuration is deleted
async function cleanupConfigTextures(configId) {
  try {
    const configTexturesPath = path.join(__dirname, '../Frontend/public/config-textures', configId);
    if (fs.existsSync(configTexturesPath)) {
      await fs.promises.rmdir(configTexturesPath, { recursive: true });
    }
  } catch (error) {
    console.error('Error cleaning up texture files:', error);
  }
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-here";

// Ensure default demo accounts exist and match expected credentials/permissions
const ensureDefaultAccounts = async () => {
  try {
    const ensureAccount = async ({
      email,
      name,
      role,
      password,
      permissions
    }) => {
      let user = await User.findOne({ email });
      const hashedPassword = await bcrypt.hash(password, 10);

      if (!user) {
        await User.create({
          name,
          email,
          password: hashedPassword,
          role,
          permissions,
          isActive: true
        });
        console.log(`✅ Default ${role} account created: ${email} / ${password}`);
        return;
      }

      // If user exists, make sure password, role, permissions and active status are as expected
      const passwordMatches = await bcrypt.compare(password, user.password);
      const updates = {};
      if (!passwordMatches) updates.password = hashedPassword;
      if (user.role !== role) updates.role = role;
      // Restore full demo permissions to avoid "No Configuration" state
      updates.permissions = permissions;
      if (!user.isActive) updates.isActive = true;

      if (Object.keys(updates).length) {
        await User.updateOne({ _id: user._id }, { $set: updates });
        console.log(`🔄 Default ${role} account reset: ${email}`);
      } else {
        console.log(`✅ Default ${role} account verified: ${email}`);
      }
    };

    const fullPermissions = {
      doorPresets: true,
      doorToggles: true,
      drawerToggles: true,
      textureWidget: true,
      lightWidget: true,
      globalTextureWidget: true,
      // Add missing widget permissions
      reflectionWidget: true,
      movementWidget: true,
      customWidget: true,
      saveConfig: true,
      canRotate: true,
      canPan: true,
      canZoom: true,
      canMove: true
    };

    await ensureAccount({
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
      password: "admin123",
      permissions: fullPermissions
    });

    await ensureAccount({
      email: "user@example.com",
      name: "Demo User",
      role: "user",
      password: "user123",
      permissions: fullPermissions
    });
  } catch (error) {
    console.error("❌ Error ensuring default accounts:", error.message);
  }
};

// Auth middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: "Account deactivated" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Routes
app.post("/api/auth/register", async (req, res) => {
  try {
  let { name, email, password } = req.body;
  // Normalize inputs
  email = (email || "").toLowerCase().trim();
  password = (password || "").trim();
  name = (name || "").trim();
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      permissions: {
        canRotate: true,
        doorPresets: false,
        doorToggles: false,
        drawerToggles: false,
        textureWidget: false,
        lightWidget: false,
        globalTextureWidget: false,
        canPan: false,
        canZoom: false
      }
    });
    
    // Generate token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Error creating user", error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
  let { email, password } = req.body;
  email = (email || "").toLowerCase().trim();
  password = (password || "").trim();
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find user
  const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ message: "Account is deactivated" });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: "Invalid password" });
    }
    
    // Generate token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Error logging in", error: error.message });
  }
});

// Token verification endpoint
app.get("/api/auth/verify", authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        permissions: req.user.permissions,
        isActive: req.user.isActive
      }
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      permissions: req.user.permissions,
      isActive: req.user.isActive
    }
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// Admin dashboard routes
app.get("/api/admin-dashboard/users", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    
    // Ensure all users have complete permissions structure
    const defaultPermissions = {
      doorPresets: false,
      doorToggles: false,
      drawerToggles: false,
      textureWidget: false,
      lightWidget: false,
      globalTextureWidget: false,
      saveConfig: false,
      canRotate: true,
      canPan: false,
      canZoom: false
    };

    const usersWithCompletePermissions = users.map(user => {
      const userObj = user.toObject();
      userObj.permissions = { ...defaultPermissions, ...userObj.permissions };
      return userObj;
    });

    res.json(usersWithCompletePermissions);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ message: "Error fetching users", error: error.message });
  }
});

app.put("/api/admin-dashboard/users/:id/permissions", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { permissions } = req.body;
    
    // Ensure complete permissions structure
    const defaultPermissions = {
      doorPresets: false,
      doorToggles: false,
      drawerToggles: false,
      textureWidget: false,
      lightWidget: false,
      globalTextureWidget: false,
      saveConfig: false,
      canRotate: true,
      canPan: false,
      canZoom: false
    };

    const completePermissions = { ...defaultPermissions, ...permissions };

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { permissions: completePermissions },
      { new: true, select: "-password" }
    );
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ message: "Permissions updated successfully", user });
  } catch (error) {
    console.error("Update permissions error:", error);
    res.status(500).json({ message: "Error updating permissions", error: error.message });
  }
});

app.patch("/api/admin-dashboard/users/:id/toggle-active", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Don't allow deactivating yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot deactivate your own account" });
    }
    
    user.isActive = !user.isActive;
    await user.save();
    
    res.json({ 
      message: "User status updated successfully", 
      isActive: user.isActive,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        permissions: user.permissions
      }
    });
  } catch (error) {
    console.error("Toggle active status error:", error);
    res.status(500).json({ message: "Error updating user status", error: error.message });
  }
});

app.delete("/api/admin-dashboard/users/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Don't allow deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }
    
    await User.findByIdAndDelete(req.params.id);
    
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Error deleting user", error: error.message });
  }
});

// Call after MongoDB connection
mongoose.connection.on("connected", () => {
  ensureDefaultAccounts();
});
// Get activity logs (accessible to both admin and users)
app.get("/api/activity/logs", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, action } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    
    if (req.user.role === "user") {
      // Users can only see their own logs and public logs
      filter.$or = [
        { userId: req.user._id },
        { visibility: "public" }
      ];
    } else if (req.user.role === "admin") {
      // Admins can see all logs
      if (req.query.userId) {
        filter.userId = req.query.userId;
      }
    }
    
    // Date filtering
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }
    
    // Action filtering
    if (action) {
      filter.action = new RegExp(action, 'i');
    }

    const logs = await ActivityLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email role');

    const total = await ActivityLog.countDocuments(filter);

    res.json({
      logs,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      userRole: req.user.role
    });
  } catch (error) {
    console.error("Get activity logs error:", error);
    res.status(500).json({ message: "Error fetching activity logs", error: error.message });
  }
});

// Log model interaction
app.post("/api/activity/log", authMiddleware, async (req, res) => {
  try {
    const { action, modelName, partName, widgetType, details, visibility = "user" } = req.body;
    const ip = getClientIp(req);
    const userAgent = req.get('User-Agent') || '';

    const log = await ActivityLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      action: action,
      details: details || {},
      ipAddress: ip,
      userAgent: userAgent,
      modelName: modelName || "",
      partName: partName || "",
      widgetType: widgetType || "",
      visibility: visibility,
      timestamp: new Date()
    });

    res.json({ message: "Activity logged successfully", log });
  } catch (error) {
    console.error("Activity logging error:", error);
    res.status(500).json({ message: "Error logging activity", error: error.message });
  }
});

// Get statistics for dashboard
app.get("/api/activity/stats", authMiddleware, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let filter = { timestamp: { $gte: thirtyDaysAgo } };
    
    if (req.user.role === "user") {
      filter.userId = req.user._id;
    }

    const stats = await ActivityLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    const totalActions = await ActivityLog.countDocuments(filter);
    const popularActions = await ActivityLog.aggregate([
      { $match: filter },
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      dailyStats: stats,
      totalActions,
      popularActions,
      timeFrame: "30 days"
    });
  } catch (error) {
    console.error("Get activity stats error:", error);
    res.status(500).json({ message: "Error fetching activity stats", error: error.message });
  }
});

// Model Management Routes

// Get active models for users (no auth required for viewing models)
app.get("/api/models", async (req, res) => {
  try {
    const models = await Model.find({ status: 'active' }).select('-uploadedBy -createdAt -updatedAt');
    
    // Convert to format expected by frontend
    const formattedModels = models.map(model => {
      const meta = model.metadata || {};
      // Normalize uiWidgets: prefer top-level uiWidgets, fallback to metadata.uiWidgets
      const uiWidgets = Array.isArray(model.uiWidgets) && model.uiWidgets.length
        ? model.uiWidgets
        : (Array.isArray(meta.uiWidgets) ? meta.uiWidgets : []);

      // Normalize lights and hiddenInitially from either top-level or metadata (backward compatibility)
      const lights = Array.isArray(model.lights) && model.lights.length
        ? model.lights
        : (Array.isArray(meta.lights) ? meta.lights : []);
      const hiddenInitially = Array.isArray(model.hiddenInitially) && model.hiddenInitially.length
        ? model.hiddenInitially
        : (Array.isArray(meta.hiddenInitially) ? meta.hiddenInitially : []);

      // Normalize asset paths to absolute backend URLs so the frontend (on port 5173) can load them
      const normalizeAssetPath = (p) => {
        if (!p || typeof p !== 'string') return undefined;
        if (p.startsWith('http://') || p.startsWith('https://')) return p;
        if (p.startsWith('/models/')) return `http://localhost:5000${p}`;
        // treat as filename
        return `http://localhost:5000/models/${p}`;
      };
      const assetsRaw = model.assets || undefined;
      // Expose ALL asset keys, not just base/doors/drawers/glassDoors
      const assets = assetsRaw && typeof assetsRaw === 'object'
        ? Object.fromEntries(
            Object.entries(assetsRaw).map(([key, value]) => [key, normalizeAssetPath(value)])
          )
        : undefined;

      // Normalize config URL to absolute so the frontend can fetch it regardless of port
      const normalizeConfigUrl = (u) => {
        if (!u || typeof u !== 'string') return undefined;
        if (u.startsWith('http://') || u.startsWith('https://')) return u;
        if (u.startsWith('/')) return `http://localhost:5000${u}`;
        return `http://localhost:5000/${u}`;
      };

      return {
        id: model._id,
        name: model.name,
        displayName: model.displayName,
        file: `http://localhost:5000/models/${model.file}`,
        type: model.type,
        // Fallback to metadata.configUrl for legacy/older records
        configUrl: normalizeConfigUrl(model.configUrl || meta.configUrl) || undefined,
        interactionGroups: model.interactionGroups || [],
        metadata: { ...meta, uiWidgets },
        // Also expose commonly used fields at top-level for the viewer
        uiWidgets,
        lights,
        hiddenInitially,
        camera: model.camera || meta.camera || undefined,
        assets,
        presets: model.presets || undefined,
        // Expose admin-defined placement/transform so the viewer can apply it
        placementMode: model.placementMode || 'autofit',
        modelPosition: Array.isArray(model.modelPosition) ? model.modelPosition : undefined,
        modelRotation: Array.isArray(model.modelRotation) ? model.modelRotation : undefined,
        modelScale: typeof model.modelScale === 'number' ? model.modelScale : undefined
      };
    });
    
    console.log('=== MODELS API DEBUG ===');
    console.log('Raw models from DB:', models.length);
    if (models.length > 0) {
      console.log('Sample model metadata:', models[0].metadata);
      console.log('Sample exposed fields (top-level):', {
        uiWidgets: formattedModels[0]?.uiWidgets?.length || 0,
        lights: formattedModels[0]?.lights?.length || 0,
        hiddenInitially: formattedModels[0]?.hiddenInitially?.length || 0,
        hasCamera: !!formattedModels[0]?.camera,
        hasAssets: !!formattedModels[0]?.assets,
        hasPresets: !!formattedModels[0]?.presets,
      });
      console.log('Sample placement fields:', {
        placementMode: models[0].placementMode,
        modelPosition: models[0].modelPosition,
        modelRotation: models[0].modelRotation,
        modelScale: models[0].modelScale
      });
    }
    console.log('Formatted models (with placement & assets):', formattedModels);
    console.log('=======================');
    
    res.json(formattedModels);
  } catch (error) {
    console.error("Get models error:", error);
    res.status(500).json({ message: "Error fetching models", error: error.message });
  }
});

// Admin only routes
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Get all models
app.get("/api/admin/models", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const models = await Model.find().populate('uploadedBy', 'name email');
    res.json(models);
  } catch (error) {
    console.error("Get models error:", error);
    res.status(500).json({ message: "Error fetching models", error: error.message });
  }
});

// Upload new model
app.post("/api/admin/models/upload", authMiddleware, requireAdmin, upload.single('modelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { name, displayName, type, interactionGroups, metadata } = req.body;
    
    // Parse JSON strings
    const parsedInteractionGroups = interactionGroups ? JSON.parse(interactionGroups) : [];
    const parsedMetadata = metadata ? JSON.parse(metadata) : {};

    console.log('=== UPLOAD DEBUG ===');
    console.log('Parsed Interaction Groups:', parsedInteractionGroups);
    console.log('Parsed Metadata:', parsedMetadata);
    console.log('====================');

    const newModel = new Model({
      name,
      displayName,
      file: req.file.filename,
      type,
      interactionGroups: parsedInteractionGroups,
      metadata: parsedMetadata,
      uploadedBy: req.user._id
    });

    await newModel.save();
    await newModel.populate('uploadedBy', 'name email');

    res.status(201).json({
      message: "Model uploaded successfully",
      model: newModel
    });
  } catch (error) {
    console.error("Upload model error:", error);
    // Clean up uploaded file on error
    if (req.file) {
      const filePath = path.join(__dirname, '../Frontend/public/models', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    res.status(500).json({ message: "Error uploading model", error: error.message });
  }
});

// Simple file upload endpoint (just uploads file, no model creation)
app.post("/api/upload", authMiddleware, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Return the file path
    const filePath = `http://localhost:5000/models/${req.file.filename}`;
    res.status(200).json({
      message: "File uploaded successfully",
      path: filePath,
      filename: req.file.filename
    });
  } catch (error) {
    console.error("File upload error:", error);
    // Clean up uploaded file on error
    if (req.file) {
      const fileToDelete = path.join(__dirname, '../Frontend/public/models', req.file.filename);
      if (fs.existsSync(fileToDelete)) {
        fs.unlinkSync(fileToDelete);
      }
    }
    res.status(500).json({ message: "Error uploading file", error: error.message });
  }
});

// Upload texture file
app.post("/api/admin/textures/upload", authMiddleware, requireAdmin, uploadTexture.single('textureFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Return the file path relative to public directory
    const filePath = `/texture/${req.file.filename}`;
    res.status(200).json({
      message: "Texture uploaded successfully",
      path: filePath,
      filename: req.file.filename,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error("Texture upload error:", error);
    // Clean up uploaded file on error
    if (req.file) {
      const fileToDelete = path.join(__dirname, '../Frontend/public/texture', req.file.filename);
      if (fs.existsSync(fileToDelete)) {
        fs.unlinkSync(fileToDelete);
      }
    }
    res.status(500).json({ message: "Error uploading texture", error: error.message });
  }
});

// Upload texture file (for regular users)
app.post("/api/upload-texture", authMiddleware, uploadTexture.single('texture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Return the file path relative to public directory
    const filePath = `/texture/${req.file.filename}`;
    console.log(`📤 Texture uploaded successfully: ${filePath}`);
    
    res.status(200).json({
      message: "Texture uploaded successfully",
      path: filePath,
      filename: req.file.filename,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error("Texture upload error:", error);
    // Clean up uploaded file on error
    if (req.file) {
      const fileToDelete = path.join(__dirname, '../Frontend/public/texture', req.file.filename);
      if (fs.existsSync(fileToDelete)) {
        fs.unlinkSync(fileToDelete);
      }
    }
    res.status(500).json({ message: "Error uploading texture", error: error.message });
  }
});

// Save model configuration (when file is already uploaded)
app.post("/api/admin/models", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, path, configUrl, assets } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Model name is required" });
    }
    
    if (!path) {
      return res.status(400).json({ message: "Model path is required" });
    }

    console.log('=== SAVE MODEL CONFIG DEBUG ===');
    console.log('Name:', name);
    console.log('Path:', path);
    console.log('ConfigUrl:', configUrl);
    console.log('Assets:', assets);
    console.log('===============================');


    // Extract filename from path for storage
    const filename = path.split('/').pop();

    // Sanitize configUrl: store as provided (supports external URLs), but trim spaces
    const sanitizedConfigUrl = typeof configUrl === 'string' ? configUrl.trim() : undefined;

    const newModel = new Model({
      name,
      displayName: name,
      file: filename,
      type: 'glb',
      configUrl: sanitizedConfigUrl,
      assets: assets, // Add assets field
      uploadedBy: req.user._id
    });

    await newModel.save();
    // Placement/transform fields are managed via external config JSON; none are persisted here.
    await newModel.populate('uploadedBy', 'name email');

    console.log('=== MODEL SAVED ===');
    console.log('Model ID:', newModel._id);
    console.log('Model metadata:', newModel.metadata);
    console.log('==================');

    res.status(201).json({
      message: "Model saved successfully",
      model: newModel
    });
  } catch (error) {
    console.error("Save model error:", error);
    res.status(500).json({ message: "Error saving model", error: error.message });
  }
});

// Update model
app.put("/api/admin/models/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, displayName, type, status, file, path: filePath, configUrl, assets } = req.body;

    const updateData = {};
    if (typeof name === 'string') updateData.name = name;
    if (typeof displayName === 'string') updateData.displayName = displayName;
    if (typeof type === 'string') updateData.type = type;
    if (typeof status === 'string') updateData.status = status;
    if (typeof configUrl === 'string') updateData.configUrl = configUrl.trim();
    if (assets !== undefined) updateData.assets = assets; // Add assets field
    // Allow updating file via either file or path (use filename only)
    if (typeof file === 'string') updateData.file = file.split('/').pop();
    if (typeof filePath === 'string') updateData.file = filePath.split('/').pop();

    console.log('=== UPDATE MODEL DEBUG ===');
    console.log('Incoming basic fields:', updateData);

    const model = await Model.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('uploadedBy', 'name email');

    if (!model) {
      return res.status(404).json({ message: "Model not found" });
    }

    console.log('Persisted placement/transform fields after update:', {
      placementMode: model.placementMode,
      modelPosition: model.modelPosition,
      modelRotation: model.modelRotation,
      modelScale: model.modelScale
    });

    res.json({
      message: "Model updated successfully",
      model
    });
  } catch (error) {
    console.error("Update model error:", error);
    res.status(500).json({ message: "Error updating model", error: error.message });
  }
});

// Delete model
app.delete("/api/admin/models/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('=== DELETE MODEL DEBUG ===');
    console.log('Model ID to delete:', id);
    
    const model = await Model.findById(id);
    console.log('Found model:', model ? `${model.name} (${model.file})` : 'null');

    if (!model) {
      return res.status(404).json({ message: "Model not found" });
    }

    // Delete the main model file
    const filePath = path.join(__dirname, '../Frontend/public/models', model.file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Main model file deleted:', filePath);
    }

    // Delete config JSON if local
    if (model.configUrl && typeof model.configUrl === 'string' && model.configUrl.startsWith('/configs/')) {
      const configPath = path.join(__dirname, '../Frontend/public', model.configUrl);
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        console.log('Config JSON deleted:', configPath);
      }
    }

    // Delete asset files if local
    if (model.assets && typeof model.assets === 'object') {
      Object.values(model.assets).forEach(assetPath => {
        if (typeof assetPath === 'string') {
          let fileToDelete;
          if (assetPath.startsWith('/models/')) {
            // Relative path
            fileToDelete = path.join(__dirname, '../Frontend/public', assetPath);
          } else if (assetPath.includes('/models/')) {
            // Full URL - extract filename
            const urlParts = assetPath.split('/models/');
            if (urlParts.length > 1) {
              const filename = urlParts[1];
              fileToDelete = path.join(__dirname, '../Frontend/public/models', filename);
            }
          }

          if (fileToDelete && fs.existsSync(fileToDelete)) {
            fs.unlinkSync(fileToDelete);
            console.log('Asset file deleted:', fileToDelete);
          }
        }
      });
    }

    await Model.findByIdAndDelete(id);
    console.log('Model deleted from database');
    console.log('========================');

    res.json({ message: "Model deleted successfully" });
  } catch (error) {
    console.error("Delete model error:", error);
    res.status(500).json({ message: "Error deleting model", error: error.message });
  }
});

// Get model files list
app.get("/api/admin/models/files", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const modelsPath = path.join(__dirname, '../Frontend/public/models');
    
    if (!fs.existsSync(modelsPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(modelsPath).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.glb', '.gltf'].includes(ext);
    });

    const fileList = files.map(file => ({
      name: file,
      path: `/models/${file}`,
      size: fs.statSync(path.join(modelsPath, file)).size
    }));

    res.json(fileList);
  } catch (error) {
    console.error("Get model files error:", error);
    res.status(500).json({ message: "Error fetching model files", error: error.message });
  }
});

// ==========================================
// SAVED CONFIGURATIONS API ENDPOINTS
// ==========================================

// Save user configuration
app.post("/api/configs/save", authMiddleware, async (req, res) => {
  try {
    const { name, description, modelName, configData, tags, isPublic } = req.body;
    
    if (!name || !modelName || !configData) {
      return res.status(400).json({ message: "Name, modelName, and configData are required" });
    }

    // Create the configuration first to get an ID
    const savedConfig = new SavedConfiguration({
      name,
      description: description || '',
      modelName,
      userId: req.user._id,
      configData,
      tags: tags || [],
      isPublic: isPublic || false,
      textureFiles: []
    });

    await savedConfig.save();
    
    // Process texture files if any textures are applied
    if (configData.textureSettings && Object.keys(configData.textureSettings).length > 0) {
      console.log('🔍 Processing texture files for configuration save:');
      console.log('configData.textureSettings:', configData.textureSettings);
      
      const textureFiles = [];
      
      for (const [textureKey, textureInfo] of Object.entries(configData.textureSettings)) {
        console.log(`🔍 Processing texture key: ${textureKey}`, textureInfo);
        
        // Check if we have a texture source that's a file path
        const textureSource = textureInfo.textureSource;
        console.log(`🔍 Texture source: ${textureSource}`);
        
        if (textureSource && (textureSource.startsWith('/texture/') || textureSource.startsWith('texture/'))) {
          try {
            console.log(`📂 Copying texture file: ${textureSource}`);
            
            // Copy the texture file to configuration storage
            const savedPath = await copyTextureForConfig(
              textureSource, 
              savedConfig._id.toString(), 
              textureKey
            );
            
            console.log(`✅ Texture copied to: ${savedPath}`);
            
            // Get file info
            const sourceFullPath = path.join(__dirname, '../Frontend/public', textureSource);
            const stats = await fs.promises.stat(sourceFullPath);
            
            textureFiles.push({
              originalName: path.basename(textureSource),
              savedPath: savedPath,
              configKey: textureKey,
              fileSize: stats.size,
              mimeType: `image/${path.extname(textureSource).substring(1)}`,
              uploadedAt: new Date()
            });
            
            // Update the texture info with the new path
            configData.textureSettings[textureKey].savedTexturePath = savedPath;
            
          } catch (error) {
            console.warn(`Failed to copy texture file for key ${textureKey}:`, error);
          }
        } else {
          console.log(`⏭️ Skipping texture ${textureKey}: not a file path (${textureSource})`);
        }
      }
      
      // Update the configuration with texture files and updated paths
      savedConfig.textureFiles = textureFiles;
      savedConfig.configData = configData;
      await savedConfig.save();
    }
    
    res.status(201).json({
      message: "Configuration saved successfully",
      config: savedConfig,
      textureFilesCopied: savedConfig.textureFiles.length
    });
  } catch (error) {
    console.error("Save configuration error:", error);
    res.status(500).json({ message: "Error saving configuration", error: error.message });
  }
});

// Get user's saved configurations
app.get("/api/configs/user", authMiddleware, async (req, res) => {
  try {
    const { modelName } = req.query;
    
    const filter = { userId: req.user._id };
    if (modelName) {
      filter.modelName = modelName;
    }

    const configs = await SavedConfiguration.find(filter)
      .sort({ updatedAt: -1 })
      .populate('userId', 'name email');
    
    res.json(configs);
  } catch (error) {
    console.error("Get user configurations error:", error);
    res.status(500).json({ message: "Error fetching configurations", error: error.message });
  }
});

// Get specific configuration by ID
app.get("/api/configs/:id", authMiddleware, async (req, res) => {
  try {
    const config = await SavedConfiguration.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },  // User's own config
        { isPublic: true }         // Or public config
      ]
    }).populate('userId', 'name email');

    if (!config) {
      return res.status(404).json({ message: "Configuration not found or access denied" });
    }

    res.json(config);
  } catch (error) {
    console.error("Get configuration error:", error);
    res.status(500).json({ message: "Error fetching configuration", error: error.message });
  }
});

// Delete configuration
app.delete("/api/configs/:id", authMiddleware, async (req, res) => {
  try {
    const config = await SavedConfiguration.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!config) {
      return res.status(404).json({ message: "Configuration not found or access denied" });
    }

    // Clean up texture files associated with this configuration
    await cleanupConfigTextures(config._id.toString());

    res.json({ message: "Configuration deleted successfully" });
  } catch (error) {
    console.error("Delete configuration error:", error);
    res.status(500).json({ message: "Error deleting configuration", error: error.message });
  }
});

// Serve configuration texture files
app.use('/config-textures', express.static(path.join(__dirname, '../Frontend/public/config-textures')));

// Start server on network IP
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Always listen on all interfaces

app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend running on http://${HOST}:${PORT}`);
  console.log(`🌐 Local access: http://localhost:${PORT}`);
  console.log(`🌐 Network access: http://192.168.1.7:${PORT}`);
  console.log(`🌐 Health check: http://192.168.1.7:${PORT}/api/health`);
});

// Upload developer config JSON
// Upload developer config JSON (primary route)
app.post('/api/upload-config', authMiddleware, requireAdmin, (req, res, next) => {
  next();
}, uploadConfigMiddleware);

// Backward-compatible alias under admin namespace
app.post('/api/admin/configs/upload', authMiddleware, requireAdmin, (req, res, next) => {
  next();
}, uploadConfigMiddleware);

function uploadConfigMiddleware(req, res) {
  const upload = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../Frontend/public/configs');
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      },
      filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'config-' + uniqueSuffix + path.extname(file.originalname));
      }
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.json') return cb(null, true);
      cb(new Error('Only JSON config files are allowed (.json)'));
    }
  }).single('file');

  upload(req, res, function (err) {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const filePath = `/configs/${req.file.filename}`;
    console.log(`📤 Config uploaded successfully: ${filePath}`);
    res.status(200).json({ message: 'Config uploaded successfully', path: filePath, filename: req.file.filename, originalName: req.file.originalname });
  });
}

// Express global error handler (handles request aborted and other body parse errors)
app.use((err, req, res, next) => {
  if (err) {
    // Quietly handle very common client-side aborts to avoid console spam
    if (err.message === 'request aborted') {
      return res.status(400).json({ message: err.message });
    }
    if (err.type === 'entity.too.large') {
      console.warn('⚠️ Request body too large');
      return res.status(413).json({ message: 'Payload too large' });
    }
    console.error('Unhandled error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
  next();
});