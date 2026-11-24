import { z } from "zod";

const coordinate = z.number().finite().min(-100000).max(100000);
const size = z.number().finite().min(0).max(10000);
const color = z.string().regex(/^(#[0-9a-fA-F]{3,8}|transparent)$/);
const text = z.string().max(2000);
const elementType = z.enum([
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "frame",
]);

const labelSchema = z
  .object({
    text: text.min(1),
    fontSize: z.number().finite().min(8).max(160).optional(),
  })
  .strict();

const createElementSchema = z
  .object({
    type: elementType,
    x: coordinate,
    y: coordinate,
    id: z.string().trim().min(1).max(200).optional(),
    children: z.array(z.string().trim().min(1).max(200)).max(200).optional(),
    name: text.optional(),
    width: size.optional(),
    height: size.optional(),
    angle: z
      .number()
      .finite()
      .min(-Math.PI * 2)
      .max(Math.PI * 2)
      .optional(),
    strokeColor: color.optional(),
    backgroundColor: color.optional(),
    fillStyle: z.enum(["hachure", "cross-hatch", "solid"]).optional(),
    strokeWidth: z.number().finite().min(0.5).max(20).optional(),
    strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    roughness: z.number().finite().min(0).max(2).optional(),
    opacity: z.number().finite().min(0).max(100).optional(),
    fontSize: z.number().finite().min(8).max(160).optional(),
    text: text.optional(),
    label: labelSchema.optional(),
    points: z
      .array(z.tuple([coordinate, coordinate]))
      .max(100)
      .optional(),
  })
  .strict()
  .superRefine((element, context) => {
    if (element.type === "frame" && (!element.id || !element.children)) {
      context.addIssue({
        code: "custom",
        message: "Frames require an id and a children array",
      });
    }
  });

const updateChangesSchema = z
  .object({
    x: coordinate.optional(),
    y: coordinate.optional(),
    width: size.optional(),
    height: size.optional(),
    angle: z
      .number()
      .finite()
      .min(-Math.PI * 2)
      .max(Math.PI * 2)
      .optional(),
    strokeColor: color.optional(),
    backgroundColor: color.optional(),
    fillStyle: z.enum(["hachure", "cross-hatch", "solid"]).optional(),
    strokeWidth: z.number().finite().min(0.5).max(20).optional(),
    strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    roughness: z.number().finite().min(0).max(2).optional(),
    opacity: z.number().finite().min(0).max(100).optional(),
    fontSize: z.number().finite().min(8).max(160).optional(),
    text: text.optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "Update changes must not be empty",
  });

export const aiOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create"),
      elements: z.array(createElementSchema).min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("update"),
      elementId: z.string().trim().min(1).max(200),
      changes: updateChangesSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("delete"),
      elementId: z.string().trim().min(1).max(200),
    })
    .strict(),
]);

export const aiResponseSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    operations: z.array(aiOperationSchema).max(100),
  })
  .strict();

export const AI_RESPONSE_JSON_SCHEMA = (() => {
  const schema = z.toJSONSchema(aiResponseSchema);
  delete schema.$schema;
  return schema;
})();

export type AiOperation = z.infer<typeof aiOperationSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;
