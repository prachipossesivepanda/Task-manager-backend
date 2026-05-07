const { mongoose } = require("../lib/db");

const projectMemberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["ADMIN", "MEMBER"], default: "MEMBER" },
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: { type: [projectMemberSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

projectSchema.index({ "members.userId": 1 });

module.exports = mongoose.model("Project", projectSchema);
