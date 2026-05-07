const { Router } = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signToken } = require("../lib/jwt");
const { authenticate } = require("../middleware/auth");
const { registerSchema, loginSchema } = require("../schemas");

const router = Router();

function mapUser(user) {
  return { id: String(user._id), email: user.email, name: user.name, createdAt: user.createdAt };
}

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, name } = parsed.data;
  const existing = await User.findOne({ email: email.toLowerCase() }).lean();
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email: email.toLowerCase(), passwordHash, name });
  const token = signToken({ sub: String(user._id), email: user.email });
  res.status(201).json({ user: mapUser(user), token });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({ sub: String(user._id), email: user.email });
  res.json({ user: mapUser(user), token });
});

router.get("/me", authenticate, async (req, res) => {
  const user = await User.findById(req.userId).select("_id email name createdAt").lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: String(user._id), email: user.email, name: user.name, createdAt: user.createdAt });
});

module.exports = router;
