import { z } from 'zod';

export const updateSystemSettingsSchema = z.object({
  roleTestingEnabled: z.boolean().optional(),
  defaultSessionRate: z.number().min(0).max(1_000_000).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'Provide at least one setting to update',
});
