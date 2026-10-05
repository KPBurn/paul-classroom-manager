import { publishDataChanged } from '../realtime/dataEvents.js';

/**
 * After a request that changed something succeeds, tells connected pages which
 * lists to load again. `resources` are names from DATA_RESOURCES; `audience`
 * narrows who is told (see publishDataChanged).
 */
export const announceChanges = (resources, audience) => (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        for (const resource of [resources].flat()) publishDataChanged(resource, audience);
      }
    });
  }
  next();
};
