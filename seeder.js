const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const User = require("./models/User");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error(err));

async function seedAdmin() {
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const admin = await User.create({
    name: "Admin",
    email: "admin@example.com",
    password: hashedPassword,
    role: "admin",
    permissions: {} // admin can access everything
  });
  console.log("✅ Admin user created:", admin);
  process.exit();
}

seedAdmin();
