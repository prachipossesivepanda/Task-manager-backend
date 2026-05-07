const { mongoose } = require("../lib/db");
const Project = require("../models/Project");

async function loadProjectMembership(req, res, next) {
  const projectId = req.params.projectId || req.params.id;
  if (!projectId || !req.userId || !mongoose.Types.ObjectId.isValid(projectId)) {
    res.status(400).json({ error: "projectId required" });
    return;
  }

  const project = await Project.findById(projectId).select("members").lean();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const membership = project.members.find((m) => String(m.userId) === req.userId);
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }
  req.project = { projectId, membership: { role: membership.role } };
  next();
}

function requireProjectAdmin(req, res, next) {
  if (req.project?.membership.role !== "ADMIN") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  next();
}

module.exports = { loadProjectMembership, requireProjectAdmin };
