const { Router } = require("express");
const { mongoose } = require("../lib/db");
const Task = require("../models/Task");
const Project = require("../models/Project");
const User = require("../models/User");
const { authenticate } = require("../middleware/auth");
const { loadProjectMembership, requireProjectAdmin } = require("../middleware/projectAccess");
const {
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,
  updateMemberRoleSchema,
  createTaskSchema,
  updateTaskSchema,
} = require("../schemas");

const router = Router();
router.use(authenticate);

function asId(id) {
  return new mongoose.Types.ObjectId(id);
}

async function decorateProject(project, myUserId) {
  const userIds = project.members.map((m) => m.userId);
  const users = await User.find({ _id: { $in: userIds } }).select("_id name email").lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const owner = userMap.get(String(project.ownerId));
  const taskCount = await Task.countDocuments({ projectId: project._id });

  const members = project.members.map((m) => {
    const u = userMap.get(String(m.userId));
    return {
      id: String(m._id),
      role: m.role,
      user: u ? { id: String(u._id), name: u.name, email: u.email } : null,
    };
  });

  const myMember = project.members.find((m) => String(m.userId) === String(myUserId));
  return {
    id: String(project._id),
    name: project.name,
    description: project.description,
    ownerId: String(project.ownerId),
    owner: owner ? { id: String(owner._id), name: owner.name, email: owner.email } : null,
    members,
    createdAt: project.createdAt,
    taskCount,
    myRole: myMember?.role,
  };
}

router.post("/", async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, description } = parsed.data;
  const ownerId = asId(req.userId);
  const project = await Project.create({
    name,
    description: description ?? null,
    ownerId,
    members: [{ userId: ownerId, role: "ADMIN" }],
  });

  const full = await decorateProject(project.toObject(), req.userId);
  res.status(201).json(full);
});

router.get("/", async (req, res) => {
  const projects = await Project.find({ "members.userId": asId(req.userId) }).sort({ createdAt: -1 }).lean();
  const out = [];
  for (const p of projects) {
    const full = await decorateProject(p, req.userId);
    out.push({
      id: full.id,
      name: full.name,
      description: full.description,
      ownerId: full.ownerId,
      owner: full.owner,
      createdAt: full.createdAt,
      role: full.myRole,
      taskCount: full.taskCount,
    });
  }
  res.json(out);
});

const byProject = Router({ mergeParams: true });
byProject.use(loadProjectMembership);

byProject.get("/", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.projectId)) {
    return res.status(400).json({ error: "Invalid projectId" });
  }
  const project = await Project.findById(req.params.projectId).lean();
  if (!project) return res.status(404).json({ error: "Project not found" });
  const full = await decorateProject(project, req.userId);
  res.json(full);
});

byProject.patch("/", requireProjectAdmin, async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;

  const project = await Project.findByIdAndUpdate(req.params.projectId, data, { new: true }).lean();
  if (!project) return res.status(404).json({ error: "Project not found" });
  const full = await decorateProject(project, req.userId);
  res.json(full);
});

byProject.delete("/", requireProjectAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.projectId)) {
    return res.status(400).json({ error: "Invalid projectId" });
  }
  await Project.findByIdAndDelete(req.params.projectId);
  await Task.deleteMany({ projectId: asId(req.params.projectId) });
  res.status(204).send();
});

const membersRouter = Router({ mergeParams: true });

membersRouter.get("/", async (req, res) => {
  const project = await Project.findById(req.params.projectId).lean();
  if (!project) return res.status(404).json({ error: "Project not found" });

  const users = await User.find({ _id: { $in: project.members.map((m) => m.userId) } }).select("_id name email").lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const rows = project.members
    .map((m) => {
      const u = userMap.get(String(m.userId));
      if (!u) return null;
      return { id: String(m._id), role: m.role, user: { id: String(u._id), name: u.name, email: u.email } };
    })
    .filter(Boolean)
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
  res.json(rows);
});

membersRouter.post("/", requireProjectAdmin, async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, role } = parsed.data;
  const user = await User.findOne({ email: email.toLowerCase() }).select("_id name email").lean();
  if (!user) return res.status(404).json({ error: "No user with this email — they must register first" });

  const project = await Project.findById(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  if (project.members.some((m) => String(m.userId) === String(user._id))) {
    return res.status(409).json({ error: "User is already on this project" });
  }

  project.members.push({ userId: user._id, role });
  await project.save();
  const member = project.members[project.members.length - 1];
  res.status(201).json({ id: String(member._id), role: member.role, user: { id: String(user._id), name: user.name, email: user.email } });
});

membersRouter.patch("/:userId", requireProjectAdmin, async (req, res) => {
  const parsed = updateMemberRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  const project = await Project.findById(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const target = project.members.find((m) => String(m.userId) === req.params.userId);
  if (!target) return res.status(404).json({ error: "Member not found" });

  const adminCount = project.members.filter((m) => m.role === "ADMIN").length;
  if (target.role === "ADMIN" && parsed.data.role === "MEMBER" && adminCount <= 1) {
    return res.status(400).json({ error: "Project must have at least one admin" });
  }

  target.role = parsed.data.role;
  await project.save();

  const user = await User.findById(req.params.userId).select("_id name email").lean();
  res.json({
    id: String(target._id),
    role: target.role,
    user: user ? { id: String(user._id), name: user.name, email: user.email } : null,
  });
});

membersRouter.delete("/:userId", requireProjectAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  const project = await Project.findById(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  if (String(project.ownerId) === req.params.userId) {
    return res.status(400).json({ error: "Cannot remove the project owner from the team" });
  }

  const target = project.members.find((m) => String(m.userId) === req.params.userId);
  if (!target) return res.status(404).json({ error: "Member not found" });

  if (target.role === "ADMIN") {
    const adminCount = project.members.filter((m) => m.role === "ADMIN").length;
    if (adminCount <= 1) return res.status(400).json({ error: "Project must have at least one admin" });
  }

  project.members = project.members.filter((m) => String(m.userId) !== req.params.userId);
  await project.save();

  await Task.updateMany(
    { projectId: project._id, assigneeId: asId(req.params.userId) },
    { $set: { assigneeId: null } }
  );

  res.status(204).send();
});

const tasksRouter = Router({ mergeParams: true });

tasksRouter.get("/", async (req, res) => {
  const filter = { projectId: asId(req.params.projectId) };
  if (req.query.status && ["TODO", "IN_PROGRESS", "DONE"].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  const tasks = await Task.find(filter).sort({ dueDate: 1, createdAt: -1 }).lean();

  const userIds = [
    ...new Set(tasks.flatMap((t) => [t.assigneeId ? String(t.assigneeId) : null, String(t.createdById)]).filter(Boolean)),
  ];
  const users = await User.find({ _id: { $in: userIds } }).select("_id name email").lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  res.json(
    tasks.map((t) => ({
      id: String(t._id),
      projectId: String(t.projectId),
      title: t.title,
      description: t.description,
      status: t.status,
      dueDate: t.dueDate,
      assigneeId: t.assigneeId ? String(t.assigneeId) : null,
      createdById: String(t.createdById),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      assignee: t.assigneeId
        ? (() => {
            const u = userMap.get(String(t.assigneeId));
            return u ? { id: String(u._id), name: u.name, email: u.email } : null;
          })()
        : null,
      createdBy: (() => {
        const u = userMap.get(String(t.createdById));
        return u ? { id: String(u._id), name: u.name, email: u.email } : null;
      })(),
    }))
  );
});

tasksRouter.post("/", async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { title, description, status, dueDate, assigneeId } = parsed.data;
  if (assigneeId) {
    const project = await Project.findById(req.params.projectId).select("members").lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    const member = project.members.find((m) => String(m.userId) === assigneeId);
    if (!member) return res.status(400).json({ error: "Assignee must be a member of this project" });
  }

  const task = await Task.create({
    projectId: asId(req.params.projectId),
    title,
    description: description ?? null,
    status: status ?? "TODO",
    dueDate: dueDate ? new Date(dueDate) : null,
    assigneeId: assigneeId ? asId(assigneeId) : null,
    createdById: asId(req.userId),
  });

  res.status(201).json({
    id: String(task._id),
    projectId: String(task.projectId),
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId ? String(task.assigneeId) : null,
    createdById: String(task.createdById),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });
});

tasksRouter.get("/:taskId", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.taskId)) return res.status(404).json({ error: "Task not found" });
  const task = await Task.findOne({ _id: req.params.taskId, projectId: asId(req.params.projectId) }).lean();
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({
    id: String(task._id),
    projectId: String(task.projectId),
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId ? String(task.assigneeId) : null,
    createdById: String(task.createdById),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });
});

tasksRouter.patch("/:taskId", async (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (!mongoose.Types.ObjectId.isValid(req.params.taskId)) return res.status(404).json({ error: "Task not found" });
  const existing = await Task.findOne({ _id: req.params.taskId, projectId: asId(req.params.projectId) });
  if (!existing) return res.status(404).json({ error: "Task not found" });

  if (req.project.membership.role !== "ADMIN") {
    const isAssignee = existing.assigneeId && String(existing.assigneeId) === req.userId;
    const isCreator = String(existing.createdById) === req.userId;
    if (!isAssignee && !isCreator) {
      return res.status(403).json({ error: "Members may only edit tasks they created or that are assigned to them" });
    }
  }

  const { assigneeId, dueDate, title, description, status } = parsed.data;
  if (assigneeId !== undefined && assigneeId !== null) {
    const project = await Project.findById(req.params.projectId).select("members").lean();
    const member = project?.members.find((m) => String(m.userId) === assigneeId);
    if (!member) return res.status(400).json({ error: "Assignee must be a member of this project" });
  }

  if (title !== undefined) existing.title = title;
  if (description !== undefined) existing.description = description;
  if (status !== undefined) existing.status = status;
  if (dueDate !== undefined) existing.dueDate = dueDate ? new Date(dueDate) : null;
  if (assigneeId !== undefined) existing.assigneeId = assigneeId ? asId(assigneeId) : null;

  await existing.save();
  res.json({
    id: String(existing._id),
    projectId: String(existing.projectId),
    title: existing.title,
    description: existing.description,
    status: existing.status,
    dueDate: existing.dueDate,
    assigneeId: existing.assigneeId ? String(existing.assigneeId) : null,
    createdById: String(existing.createdById),
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  });
});

tasksRouter.delete("/:taskId", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.taskId)) return res.status(404).json({ error: "Task not found" });
  const existing = await Task.findOne({ _id: req.params.taskId, projectId: asId(req.params.projectId) });
  if (!existing) return res.status(404).json({ error: "Task not found" });

  if (req.project.membership.role !== "ADMIN" && String(existing.createdById) !== req.userId) {
    return res.status(403).json({ error: "Only admins or the task creator can delete a task" });
  }

  await Task.deleteOne({ _id: existing._id });
  res.status(204).send();
});

byProject.use("/members", membersRouter);
byProject.use("/tasks", tasksRouter);
router.use("/:projectId", byProject);

module.exports = router;
