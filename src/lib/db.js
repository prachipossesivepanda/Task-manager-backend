const mongoose = require("mongoose");

async function connectDb() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }
  await mongoose.connect(mongoUri);
}

module.exports = { mongoose, connectDb };
