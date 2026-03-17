import crypto from 'crypto';

// Generate RSA key pair for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../config/env', () => ({
  config: {
    JWT_PRIVATE_KEY: privateKey,
    JWT_PUBLIC_KEY: publicKey,
    NODE_ENV: 'test',
    PORT: 4000,
    corsOrigins: ['http://localhost:3000'],
    CORS_ORIGINS: 'http://localhost:3000',
    LIVEKIT_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
    AI_SERVICE_URL: 'http://localhost:8000',
    isDev: false,
    isProd: false,
  },
}));

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(0),
  expire: jest.fn(),
  on: jest.fn(),
};

jest.mock('../../config/redis', () => ({
  redis: mockRedis,
  RedisKeys: {
    refreshToken: (id: string) => `refresh:${id}`,
    rateLimit: (key: string) => `rate_limit:${key}`,
    tenantConfig: (id: string) => `tenant:${id}:config`,
    ltiNonce: (nonce: string) => `lti:nonce:${nonce}`,
    tenantActiveSessions: (id: string) => `tenant:${id}:active_sessions`,
  },
  RedisTTL: {
    REFRESH_TOKEN: 604800,
    RATE_LIMIT: 60,
    TENANT_CONFIG: 300,
    LTI_NONCE: 600,
    SESSION_HISTORY: 7200,
    SESSION_STATE: 7200,
  },
}));

const mockDb = {
  query: jest.fn(),
  pool: { query: jest.fn(), connect: jest.fn(), on: jest.fn() },
  connect: jest.fn(),
  getClient: jest.fn(),
  withTenant: jest.fn(),
  tenantQuery: jest.fn(),
};

jest.mock('../../config/database', () => ({ db: mockDb }));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../middleware/request-logger', () => ({
  requestLogger: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../middleware/metrics', () => ({
  metricsMiddleware: (_req: any, _res: any, next: any) => next(),
  metricsHandler: (_req: any, res: any) => res.json({}),
}));

jest.mock('../../services/s3-service', () => ({
  S3Service: {
    upload: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed-url'),
    avatarKey: jest.fn().mockReturnValue('tenants/t1/avatars/a1/source.png'),
    documentKey: jest.fn().mockReturnValue('tenants/t1/personas/p1/docs/d1/file.pdf'),
    exists: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockRoomService = {
  createRoom: jest.fn().mockResolvedValue({}),
  deleteRoom: jest.fn().mockResolvedValue({}),
};

jest.mock('livekit-server-sdk', () => ({
  RoomServiceClient: jest.fn().mockImplementation(() => mockRoomService),
  AccessToken: jest.fn().mockImplementation(() => ({
    addGrant: jest.fn(),
    ttl: 0,
    toJwt: jest.fn().mockResolvedValue('mock-livekit-token'),
  })),
  VideoGrant: jest.fn(),
}));

// Mock global fetch for fire-and-forget calls to AI service
(global as any).fetch = jest.fn().mockResolvedValue({ ok: true });

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import request from 'supertest';
import { createApp } from '../../app';
import { JWTService } from '../../services/jwt-service';

const app = createApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_USER_ID = '22222222-2222-2222-2222-222222222222';
const LEARNER_USER_ID = '33333333-3333-3333-3333-333333333333';

const TENANT_CONFIG = {
  id: TENANT_ID,
  slug: 'acme',
  avatar_provider: 'simli',
  max_concurrent_sessions: 10,
  session_duration_limit_sec: 3600,
  idle_timeout_sec: 300,
  is_active: true,
};

function adminToken() {
  return JWTService.signAccessToken({
    sub: ADMIN_USER_ID,
    tid: TENANT_ID,
    role: 'admin',
    email: 'admin@acme.com',
  });
}

function learnerToken() {
  return JWTService.signAccessToken({
    sub: LEARNER_USER_ID,
    tid: TENANT_ID,
    role: 'learner',
    email: 'learner@acme.com',
  });
}

function setupTenantMock() {
  // The tenant middleware fetches tenant config from Redis or DB.
  // We mock Redis to return cached config.
  mockRedis.get.mockImplementation((key: string) => {
    if (key.startsWith('tenant:') && key.endsWith(':config')) {
      return Promise.resolve(JSON.stringify(TENANT_CONFIG));
    }
    return Promise.resolve(null);
  });
}

// IDs used throughout the lifecycle
const AVATAR_ID = 'aaaa1111-1111-1111-1111-111111111111';
const PERSONA_ID = 'bbbb2222-2222-2222-2222-222222222222';
const SCENARIO_ID = 'cccc3333-3333-3333-3333-333333333333';
const ASSIGNMENT_ID = 'dddd4444-4444-4444-4444-444444444444';
const SESSION_ID = 'eeee5555-5555-5555-5555-555555555555';

const VALID_RUBRIC = [
  {
    name: 'Communication',
    description: 'Clarity of communication',
    weight: 50,
    levels: [
      { score: 1, label: 'Poor', description: 'Unclear communication' },
      { score: 3, label: 'Good', description: 'Mostly clear' },
      { score: 5, label: 'Excellent', description: 'Crystal clear' },
    ],
  },
  {
    name: 'Empathy',
    description: 'Shows empathy',
    weight: 50,
    levels: [
      { score: 1, label: 'Poor', description: 'No empathy shown' },
      { score: 3, label: 'Good', description: 'Some empathy' },
      { score: 5, label: 'Excellent', description: 'Highly empathetic' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CRUD Lifecycle Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTenantMock();
    mockRedis.incr.mockResolvedValue(1);
  });

  // ─── Create Avatar ────────────────────────────────────────────────

  describe('POST /api/avatars (create avatar)', () => {
    it('creates an avatar with a valid image upload', async () => {
      mockDb.tenantQuery.mockResolvedValue({
        rows: [{ id: AVATAR_ID }],
      });

      // PNG magic bytes
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...Array(100).fill(0),
      ]);

      const res = await request(app)
        .post('/api/avatars')
        .set('Authorization', `Bearer ${adminToken()}`)
        .field('name', 'Test Avatar')
        .attach('image', pngBuffer, { filename: 'avatar.png', contentType: 'image/png' });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(AVATAR_ID);
      expect(res.body.data.status).toBe('processing');
    });

    it('rejects non-admin users', async () => {
      const res = await request(app)
        .post('/api/avatars')
        .set('Authorization', `Bearer ${learnerToken()}`)
        .field('name', 'Test Avatar')
        .attach('image', Buffer.from('fake'), { filename: 'avatar.png', contentType: 'image/png' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects missing image file', async () => {
      const res = await request(app)
        .post('/api/avatars')
        .set('Authorization', `Bearer ${adminToken()}`)
        .field('name', 'Test Avatar');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_FILE');
    });

    it('rejects invalid file type', async () => {
      const res = await request(app)
        .post('/api/avatars')
        .set('Authorization', `Bearer ${adminToken()}`)
        .field('name', 'Test Avatar')
        .attach('image', Buffer.from('not-an-image'), { filename: 'file.gif', contentType: 'image/gif' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    });
  });

  // ─── Create Persona ───────────────────────────────────────────────

  describe('POST /api/personas (create persona)', () => {
    it('creates a persona referencing an existing avatar', async () => {
      // First call: avatar check; second call: linked check; third call: insert
      mockDb.tenantQuery
        .mockResolvedValueOnce({ rows: [{ id: AVATAR_ID }] })           // avatar exists
        .mockResolvedValueOnce({ rows: [] })                             // no linked persona
        .mockResolvedValueOnce({                                         // insert result
          rows: [{
            id: PERSONA_ID,
            name: 'Dr. Smith',
            description: 'A friendly doctor',
            avatar_id: AVATAR_ID,
            system_prompt: 'You are Dr. Smith...',
            guardrails: {},
            rag_enabled: false,
            temperature: 0.7,
            created_by: ADMIN_USER_ID,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        });

      const res = await request(app)
        .post('/api/personas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Dr. Smith',
          description: 'A friendly doctor',
          avatar_id: AVATAR_ID,
          system_prompt: 'You are Dr. Smith...',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(PERSONA_ID);
      expect(res.body.data.avatar_id).toBe(AVATAR_ID);
    });

    it('rejects when avatar is already linked to another persona', async () => {
      mockDb.tenantQuery
        .mockResolvedValueOnce({ rows: [{ id: AVATAR_ID }] })
        .mockResolvedValueOnce({ rows: [{ id: 'other-persona', name: 'Existing Persona' }] });

      const res = await request(app)
        .post('/api/personas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Another Persona',
          avatar_id: AVATAR_ID,
          system_prompt: 'Prompt here',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('AVATAR_ALREADY_LINKED');
    });

    it('rejects when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/personas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Persona Without Avatar' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_AVATAR');
    });
  });

  // ─── Create Scenario ──────────────────────────────────────────────

  describe('POST /api/scenarios (create scenario)', () => {
    it('creates a scenario with valid rubric', async () => {
      mockDb.tenantQuery
        .mockResolvedValueOnce({ rows: [{ id: PERSONA_ID }] })  // persona exists
        .mockResolvedValueOnce({                                  // insert
          rows: [{
            id: SCENARIO_ID,
            tenant_id: TENANT_ID,
            persona_id: PERSONA_ID,
            title: 'Patient Consultation',
            description: 'Practice scenario',
            objective: 'Diagnose the patient',
            scoring_rubric: VALID_RUBRIC,
            status: 'draft',
            max_duration_sec: 600,
            max_turns: 50,
            difficulty_level: 'intermediate',
            tags: '{}',
            created_by: ADMIN_USER_ID,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        });

      const res = await request(app)
        .post('/api/scenarios')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          persona_id: PERSONA_ID,
          title: 'Patient Consultation',
          description: 'Practice scenario',
          objective: 'Diagnose the patient',
          scoring_rubric: VALID_RUBRIC,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(SCENARIO_ID);
      expect(res.body.data.status).toBe('draft');
    });

    it('rejects rubric with weights not summing to 100', async () => {
      const badRubric = [
        {
          name: 'Criterion A',
          description: 'Test',
          weight: 30,
          levels: [
            { score: 1, label: 'Low', description: 'Low' },
            { score: 5, label: 'High', description: 'High' },
          ],
        },
      ];

      const res = await request(app)
        .post('/api/scenarios')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          persona_id: PERSONA_ID,
          title: 'Bad Rubric Scenario',
          objective: 'Test',
          scoring_rubric: badRubric,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RUBRIC');
      expect(res.body.error.message).toContain('sum to 100');
    });

    it('rejects rubric with duplicate scores in a criterion', async () => {
      const dupScoreRubric = [
        {
          name: 'Criterion A',
          description: 'Test',
          weight: 100,
          levels: [
            { score: 3, label: 'Mid', description: 'Mid' },
            { score: 3, label: 'Also Mid', description: 'Also mid' },
          ],
        },
      ];

      const res = await request(app)
        .post('/api/scenarios')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          persona_id: PERSONA_ID,
          title: 'Dup Score Scenario',
          objective: 'Test',
          scoring_rubric: dupScoreRubric,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RUBRIC');
      expect(res.body.error.message).toContain('Duplicate score');
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/scenarios')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ title: 'Missing Persona' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Assign Scenario to Learner ───────────────────────────────────

  describe('POST /api/scenarios/:id/assign', () => {
    it('assigns a scenario to a list of learners', async () => {
      mockDb.tenantQuery
        .mockResolvedValueOnce({ rows: [{ id: SCENARIO_ID, status: 'active' }] })  // scenario check
        .mockResolvedValueOnce({ rows: [{ id: LEARNER_USER_ID }] })                 // user check
        .mockResolvedValueOnce({                                                     // insert
          rows: [{
            id: ASSIGNMENT_ID,
            scenario_id: SCENARIO_ID,
            user_id: LEARNER_USER_ID,
            status: 'pending',
            due_date: null,
            assigned_by: ADMIN_USER_ID,
            created_at: new Date().toISOString(),
          }],
        });

      const res = await request(app)
        .post(`/api/scenarios/${SCENARIO_ID}/assign`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ user_ids: [LEARNER_USER_ID] });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.assigned).toBe(1);
    });

    it('rejects empty user_ids array', async () => {
      const res = await request(app)
        .post(`/api/scenarios/${SCENARIO_ID}/assign`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ user_ids: [] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_USERS');
    });

    it('rejects invalid users not found in tenant', async () => {
      mockDb.tenantQuery
        .mockResolvedValueOnce({ rows: [{ id: SCENARIO_ID, status: 'active' }] })
        .mockResolvedValueOnce({ rows: [] }); // no valid users found

      const fakeUserId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const res = await request(app)
        .post(`/api/scenarios/${SCENARIO_ID}/assign`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ user_ids: [fakeUserId] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_USERS');
    });
  });

  // ─── Create Session ───────────────────────────────────────────────

  describe('POST /api/sessions (create session)', () => {
    it('creates a session for a valid assignment', async () => {
      mockDb.tenantQuery
        .mockResolvedValueOnce({  // assignment query
          rows: [{
            id: ASSIGNMENT_ID,
            scenario_id: SCENARIO_ID,
            user_id: LEARNER_USER_ID,
            status: 'pending',
            scenario_status: 'active',
            persona_id: PERSONA_ID,
            title: 'Patient Consultation',
            max_duration_sec: 600,
            max_turns: 50,
            objective: 'Diagnose the patient',
            opening_context: null,
            opening_message: 'Hello, how can I help?',
            scoring_rubric: VALID_RUBRIC,
            system_prompt: 'You are Dr. Smith',
            guardrails: {},
            rag_enabled: false,
            rag_top_k: 5,
            rag_similarity_threshold: 0.7,
            temperature: 0.7,
            avatar_id: AVATAR_ID,
            persona_name: 'Dr. Smith',
            provider: 'simli',
            provider_avatar_id: 'prov-123',
            max_concurrent_sessions: 10,
            session_duration_limit_sec: 3600,
            idle_timeout_sec: 300,
            avatar_provider: 'simli',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] })  // session insert
        .mockResolvedValueOnce({ rows: [] })                      // update session with room
        .mockResolvedValueOnce({ rows: [] });                     // update assignment status

      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('tenant:') && key.endsWith(':config')) {
          return Promise.resolve(JSON.stringify(TENANT_CONFIG));
        }
        if (key.startsWith('tenant:') && key.endsWith(':active_sessions')) {
          return Promise.resolve('0');
        }
        return Promise.resolve(null);
      });

      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${learnerToken()}`)
        .send({ assignment_id: ASSIGNMENT_ID });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBe(SESSION_ID);
      expect(res.body.data.livekitToken).toBeDefined();
    });

    it('rejects when assignment is not found', async () => {
      mockDb.tenantQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${learnerToken()}`)
        .send({ assignment_id: 'nonexistent' });

      expect(res.status).toBe(404);
    });

    it('rejects when assignment_id is missing', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${learnerToken()}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_ASSIGNMENT');
    });
  });

  // ─── End Session ──────────────────────────────────────────────────

  describe('POST /api/sessions/:id/end', () => {
    it('ends a session and updates assignment status', async () => {
      mockDb.tenantQuery
        .mockResolvedValueOnce({
          rows: [{ id: SESSION_ID, assignment_id: ASSIGNMENT_ID, livekit_room_id: `session-${SESSION_ID}` }],
        })
        .mockResolvedValueOnce({ rows: [] }); // update assignment

      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/end`)
        .set('Authorization', `Bearer ${learnerToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');

      // Active sessions counter should be decremented
      expect(mockRedis.decr).toHaveBeenCalled();
    });

    it('returns 404 when session does not exist', async () => {
      mockDb.tenantQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/sessions/nonexistent/end')
        .set('Authorization', `Bearer ${learnerToken()}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── Get Session Report ───────────────────────────────────────────

  describe('GET /api/sessions/:id/report', () => {
    it('returns the session report when scores exist', async () => {
      mockDb.tenantQuery.mockResolvedValueOnce({
        rows: [{
          id: 'score-1',
          session_id: SESSION_ID,
          overall_score: 85.5,
          criteria_scores: [{ name: 'Communication', score: 4, weight: 50 }],
          strengths: ['Clear speech'],
          improvements: ['Ask more questions'],
          narrative_feedback: 'Good job overall.',
          scored_by_model: 'gpt-4o',
          scored_at: new Date().toISOString(),
          duration_sec: 300,
          total_turns: 12,
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          scenario_title: 'Patient Consultation',
          scoring_rubric: VALID_RUBRIC,
        }],
      });

      const res = await request(app)
        .get(`/api/sessions/${SESSION_ID}/report`)
        .set('Authorization', `Bearer ${learnerToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overall_score).toBe(85.5);
      expect(res.body.data.scored_by_model).toBe('gpt-4o');
    });

    it('returns 404 when report is not yet available', async () => {
      mockDb.tenantQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/api/sessions/${SESSION_ID}/report`)
        .set('Authorization', `Bearer ${learnerToken()}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── List and Get Individual Resources ────────────────────────────

  describe('GET /api/avatars (list)', () => {
    it('returns paginated avatar list', async () => {
      mockDb.tenantQuery
        .mockResolvedValueOnce({
          rows: [{ id: AVATAR_ID, name: 'Test Avatar', status: 'ready', provider: 'simli' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(app)
        .get('/api/avatars')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('GET /api/avatars/:id', () => {
    it('returns a single avatar', async () => {
      mockDb.tenantQuery.mockResolvedValueOnce({
        rows: [{ id: AVATAR_ID, name: 'Test Avatar', status: 'ready' }],
      });

      const res = await request(app)
        .get(`/api/avatars/${AVATAR_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(AVATAR_ID);
    });

    it('returns 404 for nonexistent avatar', async () => {
      mockDb.tenantQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/avatars/nonexistent')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/avatars/:id (soft delete)', () => {
    it('soft deletes an avatar with no active sessions', async () => {
      mockDb.tenantQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })           // session check
        .mockResolvedValueOnce({ rows: [{ id: AVATAR_ID }] });       // soft delete

      const res = await request(app)
        .delete(`/api/avatars/${AVATAR_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
    });

    it('rejects deletion when active sessions exist', async () => {
      mockDb.tenantQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const res = await request(app)
        .delete(`/api/avatars/${AVATAR_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ACTIVE_SESSIONS');
    });
  });

  // ─── Authentication Required ──────────────────────────────────────

  describe('Unauthenticated access', () => {
    it('rejects requests without auth token', async () => {
      const res = await request(app).get('/api/avatars');
      expect(res.status).toBe(401);
    });
  });
});
