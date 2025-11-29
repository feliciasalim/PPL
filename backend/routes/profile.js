import express from "express";
import bcrypt from "bcrypt";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// GET /api/profile - Fetch user profile
router.get("/", authenticateToken, async (req, res) => {
  console.log("GET /api/profile called with user:", req.user.user_id);
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("user_id, name, email")
      .eq("user_id", req.user.user_id)
      .single();

    if (error || !user) {
      console.error("User fetch error:", error?.message || "No user found");
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// PUT /api/profile - Update user profile
router.put("/", authenticateToken, async (req, res) => {
  console.log("PUT /api/profile called for user:", req.user.user_id);
  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("password")
      .eq("user_id", req.user.user_id)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError?.message || "No user found");
      return res.status(404).json({ error: "User not found" });
    }

    const updates = {};

    if (req.body.name) {
      updates.name = req.body.name;
    }

    if (req.body.newPassword && req.body.currentPassword) {
      const isValidPassword = await bcrypt.compare(req.body.currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ error: "Invalid current password" });
      }

      const passwordValidation = validatePassword(req.body.newPassword);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ error: passwordValidation.message });
      }

      const isSamePassword = await bcrypt.compare(req.body.newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json({ error: "New password cannot be the same as the current password" });
      }

      const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
      updates.password = passwordHash;
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("user_id", req.user.user_id)
      .select("user_id, name, email")
      .single();

    if (updateError) {
      console.error("Update error:", updateError.message);
      return res.status(500).json({ error: "Failed to update profile" });
    }

    res.json({
      message: "User profile updated successfully",
      user: {
        user_id: updatedUser.user_id,
        name: updatedUser.name,
        email: updatedUser.email,
      },
    });
  } catch (err) {
    console.error("Update profile error:", {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// DELETE /api/profile - Delete user account
router.delete("/", authenticateToken, async (req, res) => {
  console.log("=== DELETE /api/profile called for user:", req.user.user_id);
  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id")
      .eq("user_id", req.user.user_id)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError?.message || "No user found");
      return res.status(404).json({ error: "User not found" });
    }

    // Delete history records
    const { error: historyError } = await supabase
      .from("history")
      .delete()
      .eq("user_id", req.user.user_id);

    if (historyError) {
      console.error("History delete error:", historyError.message);
      return res.status(500).json({ error: "Failed to delete history data" });
    }

    // Delete user
    const { error: userDeleteError } = await supabase
      .from("users")
      .delete()
      .eq("user_id", req.user.user_id);

    if (userDeleteError) {
      console.error("User delete error:", userDeleteError.message);
      return res.status(500).json({ error: "Failed to delete user account" });
    }

    console.log("Account deleted successfully for user:", req.user.user_id);
    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete account error:", error.message);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

function validatePassword(password) {
  const minLength = 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < minLength || !(hasLetter && hasNumber && hasSymbol)) {
    return {
      isValid: false,
      message: "Password must be at least 8 characters long and include a mix of letters, numbers, and symbols.",
    };
  }
  return { isValid: true, message: "" };
}

export default router;