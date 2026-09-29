import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchMeteredTurnIceServers } from '../src/services/meteredTurn.service.js';

describe('Metered TURN credentials', () => {
  it('fetches ICE servers with the credential-scoped API key kept in the backend request', async () => {
    let requestedUrl;
    const servers = [
      { urls: 'stun:stun.metered.ca:80' },
      {
        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
        username: 'temporary-user',
        credential: 'temporary-password',
      },
    ];

    const result = await fetchMeteredTurnIceServers(
      'classroom.metered.live',
      'credential-scoped-key',
      async (url, options) => {
        requestedUrl = new URL(url);
        assert.ok(options.signal);
        return { ok: true, json: async () => servers };
      },
    );

    assert.equal(requestedUrl.origin, 'https://classroom.metered.live');
    assert.equal(requestedUrl.pathname, '/api/v1/turn/credentials');
    assert.equal(requestedUrl.searchParams.get('apiKey'), 'credential-scoped-key');
    assert.deepEqual(result, servers);
  });

  it('rejects provider responses without a TURN relay', async () => {
    await assert.rejects(
      fetchMeteredTurnIceServers('classroom.metered.live', 'credential-scoped-key', async () => ({
        ok: true,
        json: async () => [{ urls: 'stun:stun.metered.ca:80' }],
      })),
      { statusCode: 503 },
    );
  });

  it('does not expose provider response details or API keys when the request fails', async () => {
    await assert.rejects(
      fetchMeteredTurnIceServers('classroom.metered.live', 'credential-scoped-key', async () => ({
        ok: false,
        status: 403,
      })),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.message.includes('credential-scoped-key'), false);
        return true;
      },
    );
  });
});
