import { z } from 'zod';

export const NodePortSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['any', 'json', 'string', 'number', 'boolean', 'control']).default('any'),
  description: z.string().optional(),
});

export type NodePort = z.infer<typeof NodePortSchema>;

export const NodeTypeSchema = z.enum([
  'webhook_trigger',
  'http_request',
  'js_code_transform',
  'conditional_branch',
  'delay_timer',
]);

export type NodeType = z.infer<typeof NodeTypeSchema>;

export const WebhookTriggerConfigSchema = z.object({
  path: z.string().default('/'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('POST'),
  responseMode: z.enum(['immediate_ack', 'sync_result']).default('immediate_ack'),
  authRequired: z.boolean().default(false),
  secretToken: z.string().optional(),
});

export const HttpRequestConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).default({}),
  bodyTemplate: z.string().optional(),
  timeoutMs: z.number().int().positive().default(10000),
  retryOn5xx: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(5).default(3),
});

export const JsCodeTransformConfigSchema = z.object({
  code: z.string().default('export default async function transform(input) {\n  return input;\n}'),
  timeoutMs: z.number().int().min(10).max(5000).default(500),
  memoryLimitMb: z.number().int().min(16).max(256).default(128),
});

export const ConditionalBranchConfigSchema = z.object({
  conditionExpression: z.string().default('return Boolean(input);'),
  trueBranchPortId: z.string().default('true'),
  falseBranchPortId: z.string().default('false'),
});

export const DelayTimerConfigSchema = z.object({
  delayMs: z.number().int().min(0).max(86400000).default(1000),
  jitter: z.boolean().default(false),
});

export const NodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type NodePosition = z.infer<typeof NodePositionSchema>;

export const NodeDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('webhook_trigger'),
    label: z.string().default('Webhook Trigger'),
    config: WebhookTriggerConfigSchema.default({}),
  }),
  z.object({
    type: z.literal('http_request'),
    label: z.string().default('HTTP Request'),
    config: HttpRequestConfigSchema,
  }),
  z.object({
    type: z.literal('js_code_transform'),
    label: z.string().default('JS Code Transform'),
    config: JsCodeTransformConfigSchema.default({}),
  }),
  z.object({
    type: z.literal('conditional_branch'),
    label: z.string().default('Conditional Branch'),
    config: ConditionalBranchConfigSchema.default({}),
  }),
  z.object({
    type: z.literal('delay_timer'),
    label: z.string().default('Delay Timer'),
    config: DelayTimerConfigSchema.default({}),
  }),
]);

export type NodeData = z.infer<typeof NodeDataSchema>;

export const NodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeSchema,
  position: NodePositionSchema,
  data: NodeDataSchema,
  inputs: z.array(NodePortSchema).default([]),
  outputs: z.array(NodePortSchema).default([]),
  width: z.number().optional().default(240),
  height: z.number().optional().default(140),
});

export type Node = z.infer<typeof NodeSchema>;
