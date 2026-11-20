import { z } from 'zod';
import { NodeSchema } from './node.js';
import { EdgeSchema } from './edge.js';

export const ViewportSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().default(1),
});

export type Viewport = z.infer<typeof ViewportSchema>;

export const WorkflowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().default(''),
  version: z.number().int().positive().default(1),
  nodes: z.array(NodeSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  viewport: ViewportSchema.default({ x: 0, y: 0, zoom: 1 }),
  isPublished: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().default(''),
  nodes: z.array(NodeSchema).optional().default([]),
  edges: z.array(EdgeSchema).optional().default([]),
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  nodes: z.array(NodeSchema).optional(),
  edges: z.array(EdgeSchema).optional(),
  viewport: ViewportSchema.optional(),
  isPublished: z.boolean().optional(),
});

export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;

export const WorkflowVersionSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  snapshot: z.object({
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
  }),
  publishedAt: z.string().datetime(),
  publishedBy: z.string().optional(),
});

export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;
