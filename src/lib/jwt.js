const jwt = require("jsonwebtoken");

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error("JWT_SECRET is required");
}

function signToken(payload) {
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, secret);
}

module.exports = { signToken, verifyToken };
