import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'system' },
    roleTestingEnabled: { type: Boolean, default: false },
    // Which integration powers live classrooms. 'webrtc' is the built-in peer-to-peer
    // room; 'zoom' is stored for the planned Zoom meeting integration.
    classroomIntegration: { type: String, enum: ['webrtc', 'zoom'], default: 'webrtc' },
    // Credentials used to build the WebRTC ICE list (resolved in systemSettings.service).
    // An empty value falls back to the corresponding server environment variable.
    webrtc: {
      meteredTurnHost: { type: String, default: '' },
      meteredTurnApiKey: { type: String, default: '' },
      iceServersJson: { type: String, default: '' },
    },
    // Zoom Server-to-Server OAuth app credentials. Saved now so an administrator can
    // declare them; not yet used by classrooms until the Zoom integration lands.
    zoom: {
      accountId: { type: String, default: '' },
      clientId: { type: String, default: '' },
      clientSecret: { type: String, default: '' },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);
