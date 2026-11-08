import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { generateTokens } from '../src/utils/jwt';
import { RealtimeService } from '../src/websocket/realtime.service';
import { initWebSocket, setChatRepository } from '../src/websocket/socket';
import {
  InMemoryChatRepository,
  InMemoryUserRepository,
  InMemoryInstrumentRepository,
} from './mocks/in-memory-repositories';
import {
  ChatService,
  ChatController,
} from '../src/modules/chat';

describe('Phase 5E: Global Trader Chat, Symbol Rooms & Direct Messaging', () => {
  let userRepo: InMemoryUserRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let chatRepo: InMemoryChatRepository;

  let realtimeService: RealtimeService;
  let chatService: ChatService;
  let chatController: ChatController;

  let app: any;
  let server: http.Server;
  let port: number;

  let trader1Token: string;
  let trader2Token: string;
  let trader3Token: string;
  let adminToken: string;

  const TRADER1_ID = 101;
  const TRADER2_ID = 102;
  const TRADER3_ID = 103;
  const ADMIN_ID = 999;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    chatRepo = new InMemoryChatRepository();
    setChatRepository(chatRepo);

    realtimeService = new RealtimeService();
    chatService = new ChatService(
      chatRepo,
      userRepo,
      instrumentRepo,
      realtimeService
    );
    chatController = new ChatController(chatService);

    // Seed test users
    await userRepo.create({
      id: TRADER1_ID,
      username: 'alice_trader',
      email: 'alice@tradegrid.internal',
      role: 'TRADER',
    } as any);

    await userRepo.create({
      id: TRADER2_ID,
      username: 'bob_trader',
      email: 'bob@tradegrid.internal',
      role: 'TRADER',
    } as any);

    await userRepo.create({
      id: TRADER3_ID,
      username: 'charlie_trader',
      email: 'charlie@tradegrid.internal',
      role: 'TRADER',
    } as any);

    await userRepo.create({
      id: ADMIN_ID,
      username: 'exchange_admin',
      email: 'admin@tradegrid.internal',
      role: 'ADMIN',
    } as any);

    trader1Token = generateTokens({
      id: TRADER1_ID,
      email: 'alice@tradegrid.internal',
      username: 'alice_trader',
      role: 'TRADER',
    }).accessToken;

    trader2Token = generateTokens({
      id: TRADER2_ID,
      email: 'bob@tradegrid.internal',
      username: 'bob_trader',
      role: 'TRADER',
    }).accessToken;

    trader3Token = generateTokens({
      id: TRADER3_ID,
      email: 'charlie@tradegrid.internal',
      username: 'charlie_trader',
      role: 'TRADER',
    }).accessToken;

    adminToken = generateTokens({
      id: ADMIN_ID,
      email: 'admin@tradegrid.internal',
      username: 'exchange_admin',
      role: 'ADMIN',
    }).accessToken;

    app = createApp({
      chatController,
      customCheckDb: async () => true,
    });

    server = http.createServer(app);
    realtimeService.setIO(initWebSocket(server));

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    try {
      realtimeService.getIO()?.close();
    } catch {}
    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ==========================================================================
  // 1. Authentication & Authorization Security
  // ==========================================================================
  describe('Authentication & Room Authorization Security', () => {
    it('1. should reject unauthenticated access when posting messages', async () => {
      const res = await request(app)
        .post('/api/v1/chat/rooms/global/messages')
        .send({ content: 'Anonymous message attempt' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('2. should reject guest sockets subscribing to chat channels', async () => {
      const guestSocket: ClientSocket = Client(`http://localhost:${port}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => guestSocket.on('connect', () => resolve()));

      const ack = await new Promise<any>((resolve) => {
        guestSocket.emit('subscribe', { channel: 'chat:global' }, (response: any) =>
          resolve(response)
        );
      });

      expect(ack.status).toBe('error');
      expect(ack.message).toContain('Unauthorized');
      guestSocket.disconnect();
    });

    it('3. should reject non-participants from viewing private conversation messages', async () => {
      // Alice starts conversation with Bob
      const conv = await chatService.getOrCreateConversation(TRADER1_ID, TRADER2_ID);

      // Charlie (unauthorized third-party) attempts to read Alice and Bob's messages
      const res = await request(app)
        .get(`/api/v1/chat/conversations/${conv.id}/messages`)
        .set('Authorization', `Bearer ${trader3Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('4. should reject non-participants from subscribing to private conversation WebSocket channels', async () => {
      const conv = await chatService.getOrCreateConversation(TRADER1_ID, TRADER2_ID);

      // Charlie connects socket
      const charlieSocket: ClientSocket = Client(`http://localhost:${port}`, {
        auth: { token: trader3Token },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => charlieSocket.on('connect', () => resolve()));

      const ack = await new Promise<any>((resolve) => {
        charlieSocket.emit('subscribe', { channel: `chat:conversation:${conv.id}` }, (response: any) =>
          resolve(response)
        );
      });

      expect(ack.status).toBe('error');
      expect(ack.message).toContain('Unauthorized');
      charlieSocket.disconnect();
    });
  });

  // ==========================================================================
  // 2. Global & Symbol Trader Chat
  // ==========================================================================
  describe('Global & Symbol Trader Discussion Rooms', () => {
    it('5. should post and retrieve global chat messages with cursor pagination', async () => {
      // Alice posts in global room
      const postRes = await request(app)
        .post('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: 'Nifty rally starting this morning! Bullish setup.' });

      expect(postRes.status).toBe(201);
      expect(postRes.body.data.content).toBe('Nifty rally starting this morning! Bullish setup.');
      expect(postRes.body.data.senderUsername).toBe('alice_trader');

      // Bob reads global room messages
      const getRes = await request(app)
        .get('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader2Token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.messages.length).toBeGreaterThan(0);
      expect(getRes.body.data.messages[0].content).toContain('Nifty rally');
    });

    it('6. should post and retrieve symbol-specific chat messages scoped to ticker', async () => {
      // Alice posts in RELIANCE discussion room
      const postRes = await request(app)
        .post('/api/v1/chat/rooms/symbol-reliance/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: 'Strong support holding at ₹2,450 for RELIANCE' });

      expect(postRes.status).toBe(201);
      expect(postRes.body.data.roomId).toBeDefined();

      // Read RELIANCE messages
      const relianceMsgs = await request(app)
        .get('/api/v1/chat/rooms/symbol-reliance/messages')
        .set('Authorization', `Bearer ${trader2Token}`);

      expect(relianceMsgs.status).toBe(200);
      expect(relianceMsgs.body.data.messages[0].content).toContain('₹2,450');
    });

    it('7. should prevent symbol messages from appearing in unrelated symbol rooms or global room', async () => {
      // Alice posts in TCS room
      await request(app)
        .post('/api/v1/chat/rooms/symbol-tcs/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: 'TCS Q3 margin expansion reported' });

      // Check INFY room: should NOT contain the TCS message
      const infyMsgs = await request(app)
        .get('/api/v1/chat/rooms/symbol-infy/messages')
        .set('Authorization', `Bearer ${trader2Token}`);

      expect(infyMsgs.body.data.messages.length).toBe(0);

      // Check Global room: should NOT contain the TCS message
      const globalMsgs = await request(app)
        .get('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader2Token}`);

      expect(globalMsgs.body.data.messages.some((m: any) => m.content.includes('TCS Q3'))).toBe(false);
    });

    it('8. should handle idempotency keys to prevent duplicate message submissions', async () => {
      const idempotencyKey = 'idem-unique-msg-key-101';

      // First submit
      const res1 = await request(app)
        .post('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: 'Idempotent trade note', idempotencyKey });

      expect(res1.status).toBe(201);
      const firstMsgId = res1.body.data.id;

      // Duplicate network re-submit
      const res2 = await request(app)
        .post('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: 'Idempotent trade note', idempotencyKey });

      expect(res2.status).toBe(201);
      expect(res2.body.data.id).toBe(firstMsgId); // Returned existing message without creating duplicate
    });

    it('9. should sanitize HTML content to prevent XSS script injection', async () => {
      const dangerousScript = '<script>alert("hacked")</script>Buy shares now!';
      const res = await request(app)
        .post('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: dangerousScript });

      expect(res.status).toBe(201);
      expect(res.body.data.content).not.toContain('<script>');
      expect(res.body.data.content).toContain('&lt;script&gt;');
    });

    it('10. should enforce rate limiting when exceeding 30 messages/minute', async () => {
      // Submit 30 messages rapidly
      for (let i = 0; i < 30; i++) {
        await chatService.sendRoomMessage(TRADER1_ID, 'global', { content: `Spam check #${i}` });
      }

      // 31st message should be blocked by rate limiter
      const res = await request(app)
        .post('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: 'One too many messages' });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  // ==========================================================================
  // 3. Social Mentions & Notifications
  // ==========================================================================
  describe('Social Mentions & Notifications', () => {
    it('11. should detect @username in message, record mention, and deliver notification to mentioned trader', async () => {
      // Alice mentions @bob_trader
      const postRes = await request(app)
        .post('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: 'Hey @bob_trader check the breakout on HDFCBANK!' });

      expect(postRes.status).toBe(201);

      // Check Bob's notifications
      const notifsRes = await request(app)
        .get('/api/v1/chat/notifications')
        .set('Authorization', `Bearer ${trader2Token}`);

      expect(notifsRes.status).toBe(200);
      expect(notifsRes.body.data.notifications.length).toBeGreaterThan(0);
      const mentionNotif = notifsRes.body.data.notifications[0];
      expect(mentionNotif.type).toBe('MENTION');
      expect(mentionNotif.title).toContain('@alice_trader mentioned you');
    });

    it('12. should safely ignore non-existent mentioned usernames without throwing errors', async () => {
      const res = await request(app)
        .post('/api/v1/chat/rooms/global/messages')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ content: 'Mentioning @ghost_user_who_does_not_exist in chat' });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toContain('@ghost_user_who_does_not_exist');
    });

    it('13. should retrieve user notifications and mark them as read', async () => {
      // Alice creates a notification for Charlie
      await chatService.sendRoomMessage(TRADER1_ID, 'global', { content: 'Calling @charlie_trader' });

      const notifsBefore = await chatService.getUserNotifications(TRADER3_ID, { unreadOnly: true });
      expect(notifsBefore.unreadCount).toBeGreaterThan(0);
      const notifId = notifsBefore.notifications[0].id;

      // Charlie marks notification as read
      const markRes = await request(app)
        .post(`/api/v1/chat/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${trader3Token}`);

      expect(markRes.status).toBe(200);

      const notifsAfter = await chatService.getUserNotifications(TRADER3_ID, { unreadOnly: true });
      expect(notifsAfter.unreadCount).toBe(0);
    });
  });

  // ==========================================================================
  // 4. Private Direct Messaging
  // ==========================================================================
  describe('Private One-to-One Direct Messaging', () => {
    it('14. should initiate or retrieve 1-on-1 private conversation between two traders', async () => {
      const res = await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ recipientId: TRADER2_ID });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.otherUser.id).toBe(TRADER2_ID);
      expect(res.body.data.otherUser.username).toBe('bob_trader');
    });

    it('15. should reject initiating conversation with oneself', async () => {
      const res = await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ recipientId: TRADER1_ID });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SELF_MESSAGING_PROHIBITED');
    });

    it('16. should prevent duplicate conversations between the same pair of users', async () => {
      // Alice initiates conversation with Bob
      const res1 = await chatService.getOrCreateConversation(TRADER1_ID, TRADER2_ID);

      // Bob initiates conversation with Alice
      const res2 = await chatService.getOrCreateConversation(TRADER2_ID, TRADER1_ID);

      expect(res1.id).toBe(res2.id); // Same conversation returned
    });

    it('17. should deliver direct messages in real-time to conversation socket room and send notification to recipient', async () => {
      const conv = await chatService.getOrCreateConversation(TRADER1_ID, TRADER2_ID);

      // Bob connects socket and subscribes to conversation channel
      const bobSocket: ClientSocket = Client(`http://localhost:${port}`, {
        auth: { token: trader2Token },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => bobSocket.on('connect', () => resolve()));

      await new Promise<any>((resolve) => {
        bobSocket.emit('subscribe', { channel: `chat:conversation:${conv.id}` }, (res: any) => resolve(res));
      });

      // Track received direct message
      const receivedMsgPromise = new Promise<any>((resolve) => {
        bobSocket.on('chat:direct:new', (event: any) => {
          resolve(event);
        });
      });

      // Alice sends direct message to Bob
      const sendRes = await request(app)
        .post('/api/v1/chat/direct')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ recipientId: TRADER2_ID, content: 'Confidential trade idea: shorting delta.' });

      expect(sendRes.status).toBe(201);

      const receivedEvent = await receivedMsgPromise;
      expect(receivedEvent.conversationId).toBe(conv.id);
      expect(receivedEvent.message.content).toBe('Confidential trade idea: shorting delta.');
      bobSocket.disconnect();
    });

    it('18. should track unread message count and update read cursor upon mark read', async () => {
      const conv = await chatService.getOrCreateConversation(TRADER1_ID, TRADER2_ID);

      // Alice sends 2 messages to Bob
      await chatService.sendDirectMessage(TRADER1_ID, { recipientId: TRADER2_ID, content: 'Message 1' });
      await chatService.sendDirectMessage(TRADER1_ID, { recipientId: TRADER2_ID, content: 'Message 2' });

      // Check Bob's conversations list
      const bobConvs = await chatService.listUserConversations(TRADER2_ID);
      const bobConv = bobConvs.find((c) => c.id === conv.id);
      expect(bobConv?.unreadCount).toBe(2);

      // Bob marks conversation read
      const readRes = await request(app)
        .post(`/api/v1/chat/conversations/${conv.id}/read`)
        .set('Authorization', `Bearer ${trader2Token}`);

      expect(readRes.status).toBe(200);

      const bobConvsAfter = await chatService.listUserConversations(TRADER2_ID);
      const bobConvAfter = bobConvsAfter.find((c) => c.id === conv.id);
      expect(bobConvAfter?.unreadCount).toBe(0);
    });
  });

  // ==========================================================================
  // 5. User Safety, Blocking & Moderation Controls
  // ==========================================================================
  describe('User Safety, Blocking & Moderation Controls', () => {
    it('19. should allow a user to block another user and prevent blocked users from sending direct messages', async () => {
      // Alice blocks Bob
      const blockRes = await request(app)
        .post('/api/v1/chat/blocks')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({ userId: TRADER2_ID, reason: 'Harassing trading advice' });

      expect(blockRes.status).toBe(201);
      expect(blockRes.body.data.blockedId).toBe(TRADER2_ID);

      // Bob attempts to send DM to Alice
      const sendRes = await request(app)
        .post('/api/v1/chat/direct')
        .set('Authorization', `Bearer ${trader2Token}`)
        .send({ recipientId: TRADER1_ID, content: 'Hey why did you ignore me?' });

      expect(sendRes.status).toBe(403);
      expect(sendRes.body.error.code).toBe('BLOCKED_BY_USER');
    });

    it('20. should reject blocked users from subscribing to conversation channel with the blocker', async () => {
      const conv = await chatService.getOrCreateConversation(TRADER1_ID, TRADER2_ID);

      // Alice blocks Bob
      await chatService.blockUser(TRADER1_ID, TRADER2_ID);

      // Bob tries to subscribe to the conversation socket channel
      const bobSocket: ClientSocket = Client(`http://localhost:${port}`, {
        auth: { token: trader2Token },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => bobSocket.on('connect', () => resolve()));

      const ack = await new Promise<any>((resolve) => {
        bobSocket.emit('subscribe', { channel: `chat:conversation:${conv.id}` }, (res: any) => resolve(res));
      });

      expect(ack.status).toBe('error');
      expect(ack.message).toContain('Blocked');
      bobSocket.disconnect();
    });

    it('21. should allow submitting community reports for spam or harassment', async () => {
      const reportRes = await request(app)
        .post('/api/v1/chat/reports')
        .set('Authorization', `Bearer ${trader1Token}`)
        .send({
          reportedUserId: TRADER2_ID,
          reason: 'SPAM',
          description: 'User posting external telegram pumping group links',
        });

      expect(reportRes.status).toBe(201);
      expect(reportRes.body.data.status).toBe('PENDING');
      expect(reportRes.body.data.reason).toBe('SPAM');
    });

    it('22. should reject non-admin users from accessing administrative moderation APIs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/chat/reports')
        .set('Authorization', `Bearer ${trader1Token}`); // Alice is TRADER

      expect(res.status).toBe(403);
    });

    it('23. should allow exchange administrators to review and action reports', async () => {
      // Charlie posts offensive message
      const msg = await chatService.sendRoomMessage(TRADER3_ID, 'global', { content: 'Offensive pump message' });

      // Alice reports it
      const report = await chatService.createReport(TRADER1_ID, {
        messageId: msg.id,
        reason: 'OFFENSIVE',
        description: 'Contains prohibited offensive language',
      });

      // Admin reviews report and soft-deletes message
      const reviewRes = await request(app)
        .patch(`/api/v1/admin/chat/reports/${report.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIONED', action: 'DELETE_MESSAGE' });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('ACTIONED');

      // Verify message is now soft-deleted in chat
      const checkedMsg = await chatRepo.findMessageById(msg.id);
      expect(checkedMsg?.is_deleted).toBe(true);
      expect(checkedMsg?.content).toContain('deleted by moderator');
    });
  });

  // ==========================================================================
  // 6. 100 Simultaneous Connected Users Load Benchmark
  // ==========================================================================
  describe('100 Simultaneous Connected Users Load Benchmark', () => {
    it('24. should support 100 concurrent clients connected and streaming chat messages in real time without packet loss', async () => {
      const NUM_CLIENTS = 100;
      const clients: ClientSocket[] = [];
      const connectPromises: Promise<void>[] = [];

      // Create 100 client tokens and socket connections
      for (let i = 0; i < NUM_CLIENTS; i++) {
        const token = generateTokens({
          id: 2000 + i,
          email: `trader${i}@benchmark.internal`,
          username: `trader_${i}`,
          role: 'TRADER',
        }).accessToken;

        const client = Client(`http://localhost:${port}`, {
          auth: { token },
          transports: ['websocket'],
        });
        clients.push(client);

        connectPromises.push(
          new Promise<void>((resolve) => {
            client.on('connect', () => {
              client.emit('subscribe', { channel: 'chat:global' }, () => {
                resolve();
              });
            });
          })
        );
      }

      await Promise.all(connectPromises);

      // Track received messages across all 100 connected clients
      let receivedCount = 0;
      const receivePromises: Promise<void>[] = clients.map(
        (client) =>
          new Promise<void>((resolve) => {
            client.on('chat:message:new', (event: any) => {
              expect(event.roomSlug).toBe('global');
              receivedCount++;
              resolve();
            });
          })
      );

      // Broadcast a global market newsflash message
      await chatService.sendRoomMessage(TRADER1_ID, 'global', {
        content: 'Benchmark global flash: Central Bank holds interest rates steady!',
      });

      await Promise.all(receivePromises);
      expect(receivedCount).toBe(NUM_CLIENTS);

      clients.forEach((c) => c.disconnect());
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }, 30000);
  });
});
