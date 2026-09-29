import { z } from 'zod';

export const updateSystemSettingsSchema = z.object({
  roleTestingEnabled: z.boolean(),
});
