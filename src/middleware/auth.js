const { verifyToken } = require("../lib/jwt");
const User = require("../models/User");

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).select("_id email name").lean();
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    req.userId = String(user._id);
    req.user = { id: String(user._id), email: user.email, name: user.name };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authenticate };
