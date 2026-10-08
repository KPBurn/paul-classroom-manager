# Zoom integration plan

Live classrooms currently run on the built-in **WebRTC** room (peer-to-peer media with an
optional TURN relay). This document plans how the same rooms can instead run on **Zoom**,
selected with the *Classroom integration* switch in **Admin → System Settings**.

## Where we are today

- The setting `classroomIntegration` (`webrtc` | `zoom`) is stored in `SystemSettings`
  (`server/src/models/SystemSettings.js`) and edited through `PATCH /api/system-settings`.
- The Zoom credentials (Account ID, Client ID, Client Secret) can already be declared and
  saved in that screen. They are stored in the `zoom` sub-document and are **never returned
  by the API** (only a `clientSecretSet` flag).
- While `classroomIntegration = 'zoom'` has no effect yet, rooms keep using WebRTC until the
  steps below are implemented.

## Why Server-to-Server OAuth

Zoom offers three credential types. For a server-created meeting per class session the right
one is **Server-to-Server OAuth**:

| Credential | Used for | Verdict |
| --- | --- | --- |
| Server-to-Server OAuth (Account ID, Client ID, Client Secret) | Server calls Zoom's REST API to create/manage meetings | **Use this** — matches the fields already in System Settings |
| JWT | Legacy server auth, deprecated for new apps | Do not use |
| OAuth / user tokens | Acting on behalf of a signed-in Zoom user | Not needed; nobody signs into Zoom |
| Meeting SDK (Web SDK key/secret) | Signing the browser so the embedded client may join | Needed **in addition**, see step 3 |

## Steps

1. **Create the Zoom app** (one-time, by the administrator)
   - Zoom Marketplace → *Develop* → *Create App* → *Server-to-Server OAuth*.
   - Copy the **Account ID**, **Client ID**, **Client Secret** into Admin → System Settings →
     Zoom, and add the scopes `meeting:write`, `meeting:read` (plus `meeting:write:admin` if
     available).
   - Also create the **Meeting SDK** credentials (SDK key + secret) for browser embedding;
     these are planned to live next to the OAuth fields (e.g. `zoom.sdkKey`, `zoom.sdkSecret`).

2. **Server: mint a token and create a meeting per session**
   - New service, e.g. `server/src/services/zoom.service.js`:
     - `getAccessToken()` — `POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=…`
       with Basic auth from the saved credentials; cache until it expires (`expires_in`).
     - `createMeetingForSession(session)` — `POST https://api.zoom.us/v2/users/me/meetings`
       with `topic`, `start_time`, `duration`, `settings: { join_before_host: false, … }`;
       store `zoomMeetingId` and `zoomJoinUrl` on the `ClassSession` document.
   - Decide **who owns the meeting**: recommended is *the server* (type `schedule`), so the
     teacher never needs a Zoom login; alternative is *the teacher's personal Zoom user*
     (requires provisioning users and is out of scope for v1).

3. **Server: sign the browser in**
   - Endpoint, e.g. `GET /api/sessions/:id/zoom-join` (teacher/participants only), returning
     `{ meetingNumber, sdkKey, signature, role }`.
   - Signature: HMAC-SHA256 of `sdkKey|meetingNumber|timestamp|role|sdkSecret` (Meeting SDK
     signature algorithm), timestamped fresh per request.

4. **Client: embed the Zoom Meeting SDK**
   - Add `@zoom/meetingsdk` (or the Web SDK script) as a dependency.
   - New room implementation (e.g. `client/src/pages/shared/ZoomRoom.jsx`) next to the
     current `SessionRoom.jsx`, opened when the session says the integration is `zoom`:
     `ZoomMtg.init({ sdkKey, signature, meetingNumber, … })` then `join()`.
   - Keep the existing socket layer for presence/chat/attendance — it is independent of the
     media transport.

5. **Switch on the setting**
   - `sessionResult`/room payload includes which integration a session uses; the client picks
     `SessionRoom` (WebRTC) or `ZoomRoom` accordingly.
   - Existing sessions keep the integration they started with (store it on the session).

6. **Housekeeping**
   - Delete past meetings (`DELETE /meetings/:meetingId`) or let Zoom's auto-delete handle them.
   - Reuse one meeting for recurring sessions of the same classroom if desired.

## Security & config notes

- Credentials are stored in `SystemSettings` (MongoDB). The API only ever returns
  `clientSecretSet`; treat the database with the same care as the server environment.
  Moving them to Render environment variables later is a small change (the resolution order
  already prefers settings, then falls back to env).
- Validate every value server-side before calling Zoom (already partly done: Account ID and
  Client ID are length-checked in `systemSettings.validators.js`).
- Rate-limit the join endpoint and only issue signatures for sessions the user may enter
  (reuse `assertCanEnterRoom`).

## Rollout checklist

- [ ] Create Server-to-Server OAuth app + Meeting SDK app in Zoom Marketplace
- [ ] Save credentials in Admin → System Settings → Zoom
- [ ] Implement `zoom.service.js` (token + create meeting) and hook it into session start
- [ ] Implement `GET /api/sessions/:id/zoom-join` with signature
- [ ] Add `ZoomRoom.jsx` and load the Meeting SDK
- [ ] Store the integration used on each session; branch the room on it
- [ ] End-to-end test: schedule → join → attendance recorded
