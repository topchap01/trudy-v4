// apps/backend/src/lib/zod-to-schema.ts
// Converts a Zod schema to a JSON Schema object for use with Claude tool_use.
// Covers the common Zod types used in Trudy's agent schemas.

import { z } from 'zod';

export function zodToJsonSchema(schema: z.ZodType<any>): Record<string, any> {
  return convert(schema);
}

function convert(schema: z.ZodType<any>): Record<string, any> {
  const def = (schema as any)._def;
  if (!def) return { type: 'object' };

  const typeName: string = def.typeName;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };

    case 'ZodNumber':
      return { type: 'number' };

    case 'ZodBoolean':
      return { type: 'boolean' };

    case 'ZodNull':
      return { type: 'null' };

    case 'ZodLiteral':
      return { type: typeof def.value, enum: [def.value] };

    case 'ZodEnum':
      return { type: 'string', enum: def.values };

    case 'ZodNativeEnum':
      return { type: 'string', enum: Object.values(def.values) };

    case 'ZodArray': {
      const items = convert(def.type);
      const result: Record<string, any> = { type: 'array', items };
      if (def.minLength?.value != null) result.minItems = def.minLength.value;
      if (def.maxLength?.value != null) result.maxItems = def.maxLength.value;
      return result;
    }

    case 'ZodObject': {
      const shape = def.shape();
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const inner = value as z.ZodType<any>;
        const innerDef = (inner as any)._def;
        if (innerDef?.typeName === 'ZodOptional') {
          properties[key] = convert(innerDef.innerType);
        } else {
          properties[key] = convert(inner);
          required.push(key);
        }
      }

      const result: Record<string, any> = { type: 'object', properties };
      if (required.length) result.required = required;
      return result;
    }

    case 'ZodOptional':
      return convert(def.innerType);

    case 'ZodNullable': {
      const inner = convert(def.innerType);
      return { anyOf: [inner, { type: 'null' }] };
    }

    case 'ZodDefault':
      return convert(def.innerType);

    case 'ZodUnion': {
      const options = def.options.map((opt: z.ZodType<any>) => convert(opt));
      return { anyOf: options };
    }

    case 'ZodDiscriminatedUnion': {
      const options = [...def.options.values()].map((opt: z.ZodType<any>) => convert(opt));
      return { anyOf: options };
    }

    case 'ZodRecord': {
      const valueSchema = convert(def.valueType);
      return { type: 'object', additionalProperties: valueSchema };
    }

    case 'ZodTuple': {
      const items = def.items.map((item: z.ZodType<any>) => convert(item));
      return { type: 'array', items, minItems: items.length, maxItems: items.length };
    }

    case 'ZodEffects':
      return convert(def.schema);

    case 'ZodLazy':
      return convert(def.getter());

    case 'ZodAny':
      return {};

    case 'ZodUnknown':
      return {};

    default:
      return { type: 'object' };
  }
}
