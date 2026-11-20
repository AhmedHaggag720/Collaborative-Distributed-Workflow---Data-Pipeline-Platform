import { z } from 'zod';

export const EdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetPortId: z.string().min(1),
  animated: z.boolean().default(false),
  label: z.string().optional(),
});

export type Edge = z.infer<typeof EdgeSchema>;
