// Tarefas manuais (ações guiadas em portais de seguradoras sem API).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PaginationQuerySchema, TaskStatusSchema, TaskUpdateSchema } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { pageArgs, paginated } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { taskDTO } from "../../lib/serialize";

export default async function taskRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = parse(PaginationQuerySchema.extend({ status: TaskStatusSchema.optional(), clientId: z.string().optional() }), req.query);
    const where = { ...(q.status ? { status: q.status } : {}), ...(q.clientId ? { clientId: q.clientId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.task.findMany({ where, include: { insurer: { select: { portalUrl: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
      prisma.task.count({ where }),
    ]);
    return paginated(rows.map(taskDTO), total, q);
  });

  app.patch("/:id", async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    const input = parse(TaskUpdateSchema, req.body);
    const t = await prisma.task.update({ where: { id }, data: input, include: { insurer: { select: { portalUrl: true } } } });
    await audit(req, "ATUALIZAR", "Task", id, null, input);
    return taskDTO(t);
  });
}
