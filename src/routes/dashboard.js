const { Router } = require("express");
const { mongoose } = require("../lib/db");
const Project = require("../models/Project");
const Task = require("../models/Task");
const { authenticate } = require("../middleware/auth");

const router = Router();

router.use(authenticate);

router.get("/summary", async (req, res) => {
  const userObjectId = new mongoose.Types.ObjectId(req.userId);
  const projects = await Project.find({ "members.userId": userObjectId }).select("_id name").lean();
  const projectIds = projects.map((p) => p._id);

  if (projectIds.length === 0) {
    return res.json({
      byStatus: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
      overdue: [],
      assignedToMeOpen: [],
      recentProjects: [],
    });
  }

  const now = new Date();
  const projectMap = new Map(projects.map((p) => [String(p._id), p.name]));

  const [counts, overdue, assignedOpen, tasksByProject] = await Promise.all([
    Task.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Task.find({ projectId: { $in: projectIds }, dueDate: { $lt: now }, status: { $ne: "DONE" } })
      .sort({ dueDate: 1 })
      .limit(50)
      .lean(),
    Task.find({ projectId: { $in: projectIds }, assigneeId: userObjectId, status: { $ne: "DONE" } })
      .sort({ dueDate: 1, updatedAt: -1 })
      .limit(20)
      .lean(),
    Task.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $group: { _id: "$projectId", count: { $sum: 1 } } },
    ]),
  ]);

  const byStatus = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const row of counts) byStatus[row._id] = row.count;

  const formatTask = (t) => ({
    id: String(t._id),
    title: t.title,
    status: t.status,
    dueDate: t.dueDate,
    project: { id: String(t.projectId), name: projectMap.get(String(t.projectId)) || "" },
  });

  const recentProjects = tasksByProject
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((row) => ({
      projectId: String(row._id),
      name: projectMap.get(String(row._id)) || "",
      taskCount: row.count,
    }));

  res.json({
    byStatus,
    overdue: overdue.map(formatTask),
    assignedToMeOpen: assignedOpen.map(formatTask),
    recentProjects,
  });
});

module.exports = router;
