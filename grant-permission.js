const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/3d_configurator');

// User Schema (matching server.js)
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
    saveConfig: { type: Boolean, default: false },
    canRotate: { type: Boolean, default: true },
    canPan: { type: Boolean, default: false },
    canZoom: { type: Boolean, default: false }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);

async function grantSaveConfigToUser() {
  try {
    // Grant saveConfig permission to demo user
    const result = await User.updateOne(
      { email: "user@example.com" },
      { 
        $set: { 
          "permissions.saveConfig": true,
          "permissions.doorPresets": true,
          "permissions.globalTextureWidget": true
        } 
      }
    );
    
    console.log('✅ Updated user permissions:', result);
    
    // Check the user
    const user = await User.findOne({ email: "user@example.com" }, { password: 0 });
    console.log('📋 User permissions:', user.permissions);
    
    mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    mongoose.disconnect();
  }
}

grantSaveConfigToUser();
