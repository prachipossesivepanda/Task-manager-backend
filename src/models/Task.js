const { mongoose } = require("../lib/db");

const taskSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    status: { type: String, enum: ["TODO", "IN_PROGRESS", "DONE"], default: "TODO" },
    dueDate: { type: Date, default: null },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", taskSchema);
