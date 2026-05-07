const { z } = require("zod");

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid id format");

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120).trim(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional().nullable(),
});

const updateProjectSchema = createProjectSchema.partial();

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]).optional().default("MEMBER"),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeId: objectIdSchema.optional().nullable(),
});

const updateTaskSchema = createTaskSchema.partial();

module.exports = {
  registerSchema,
  loginSchema,
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,
  updateMemberRoleSchema,
  createTaskSchema,
  updateTaskSchema,
};
