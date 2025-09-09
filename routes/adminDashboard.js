// routes/adminDashboard.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

// Get all users (admin only)
router.get("/users", authMiddleware(["admin"]), async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users", error: error.message });
  }
});

// Update user permissions
router.put("/users/:id/permissions", authMiddleware(["admin"]), async (req, res) => {
  try {
    const { permissions } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { permissions },
      { new: true, select: "-password" }
    );
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ message: "Permissions updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Error updating permissions", error: error.message });
  }
});

// Toggle user active status
router.patch("/users/:id/toggle-active", authMiddleware(["admin"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    user.isActive = !user.isActive;
    await user.save();
    
    res.json({ message: "User status updated", isActive: user.isActive });
  } catch (error) {
    res.status(500).json({ message: "Error updating user status", error: error.message });
  }
});

// Delete user
router.delete("/users/:id", authMiddleware(["admin"]), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting user", error: error.message });
  }
});

module.exports = router;