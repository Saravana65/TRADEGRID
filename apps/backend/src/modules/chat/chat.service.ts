import {
  IChatRepository,
  ChatRoomRecord,
  ChatMessageRecord,
  ChatConversationRecord,
} from './chat.types';
import { IUserRepository } from '../users/user.repository';
import { IInstrumentRepository } from '../market';
import { RealtimeService } from '../../websocket/realtime.service';
import {
  ChatRoom,
  ChatMessage,
  ChatConversation,
  ChatNotification,
  ChatUserBlock,
  ChatReport,
  ChatReportStatus,
} from '@tradegrid/shared-types';
import {
  SendChatMessageInput,
  SendDirectMessageInput,
  ChatPaginationQueryInput,
  CreateReportInput,
  ReviewReportInput,
} from '@tradegrid/validation';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';

export class ChatService {
  // In-memory rate limiting map: userId -> timestamps[]
  private rateLimits: Map<number, number[]> = new Map();
  private readonly MAX_MESSAGES_PER_MINUTE = 30;

  constructor(
    private chatRepo: IChatRepository,
    private userRepo: IUserRepository,
    private instrumentRepo?: IInstrumentRepository,
    private realtimeService?: RealtimeService
  ) {}

  /**
   * Enforces message sending rate limit (max 30 msgs/min per user)
   */
  private checkRateLimit(userId: number): void {
    const now = Date.now();
    let timestamps = this.rateLimits.get(userId) || [];
    timestamps = timestamps.filter((t) => t > now - 60000);

    if (timestamps.length >= this.MAX_MESSAGES_PER_MINUTE) {
      throw new AppError(
        429,
        'RATE_LIMIT_EXCEEDED',
        `Message rate limit exceeded. Max ${this.MAX_MESSAGES_PER_MINUTE} messages per minute.`
      );
    }

    timestamps.push(now);
    this.rateLimits.set(userId, timestamps);
  }

  /**
   * Sanitizes message content to prevent XSS and script injection
   */
  private sanitizeContent(content: string): string {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim();
  }

  /**
   * Extracts unique @username mentions from text
   */
  private extractMentions(content: string): string[] {
    const mentionRegex = /@([a-zA-Z0-9_]{3,32})/g;
    const matches = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(content)) !== null) {
      matches.add(match[1]);
    }

    return Array.from(matches);
  }

  // ==========================================================================
  // 1. Chat Rooms (Global & Symbol)
  // ==========================================================================

  async listRooms(): Promise<ChatRoom[]> {
    const rooms = await this.chatRepo.findRooms();
    return rooms.map((r) => this.mapRoomRecord(r));
  }

  async getRoomBySlug(slug: string): Promise<ChatRoom> {
    let room = await this.chatRepo.findRoomBySlug(slug.toLowerCase());

    // Dynamic resolution for valid instruments if room does not exist yet
    if (!room && slug.startsWith('symbol-') && this.instrumentRepo) {
      const symbol = slug.replace(/^symbol-/, '').toUpperCase();
      const instrument = await this.instrumentRepo.findBySymbol(symbol);
      if (instrument) {
        room = await this.chatRepo.createRoom({
          slug: `symbol-${symbol.toLowerCase()}`,
          name: `${symbol} Discussion`,
          type: 'SYMBOL',
          symbol,
          description: `Community channel for ${instrument.name} (${symbol}) exchange trading.`,
        });
      }
    }

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', `Chat room "${slug}" not found`);
    }

    return this.mapRoomRecord(room);
  }

  async getRoomMessages(
    slug: string,
    query: ChatPaginationQueryInput
  ): Promise<ChatMessage[]> {
    const room = await this.getRoomBySlug(slug);
    const records = await this.chatRepo.listRoomMessages(room.id, {
      limit: query.limit,
      beforeId: query.beforeId,
      afterId: query.afterId,
    });

    return this.hydrateMessages(records);
  }

  async sendRoomMessage(
    senderId: number,
    slug: string,
    input: SendChatMessageInput
  ): Promise<ChatMessage> {
    this.checkRateLimit(senderId);

    const room = await this.getRoomBySlug(slug);
    const cleanContent = this.sanitizeContent(input.content);

    if (cleanContent.length === 0) {
      throw new AppError(400, 'EMPTY_MESSAGE', 'Message content cannot be empty');
    }

    // Idempotency check
    if (input.idempotencyKey) {
      const existing = await this.chatRepo.findMessageByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        const [hydrated] = await this.hydrateMessages([existing]);
        return hydrated;
      }
    }

    const sender = await this.userRepo.findById(senderId);
    if (!sender) {
      throw new AppError(401, 'USER_NOT_FOUND', 'Sender not found');
    }

    // Extract @mentions
    const mentionedUsernames = this.extractMentions(cleanContent);
    const validMentionedUsers: { id: number; username: string }[] = [];

    for (const uname of mentionedUsernames) {
      const u = await this.userRepo.findByUsername(uname);
      if (u && u.id !== senderId) {
        validMentionedUsers.push({ id: u.id, username: u.username });
      }
    }

    // Persist message & mentions atomically
    const message = await this.chatRepo.transaction(async (trx) => {
      const msg = await this.chatRepo.createMessage(
        {
          roomId: room.id,
          senderId,
          content: cleanContent,
          idempotencyKey: input.idempotencyKey || null,
        },
        trx
      );

      // Mentions record
      if (validMentionedUsers.length > 0) {
        await this.chatRepo.createMentions(
          validMentionedUsers.map((u) => ({
            messageId: msg.id,
            mentionedUserId: u.id,
            roomId: room.id,
          })),
          trx
        );

        // Create Notifications
        for (const u of validMentionedUsers) {
          await this.chatRepo.createNotification(
            {
              userId: u.id,
              type: 'MENTION',
              title: `@${sender.username} mentioned you in #${room.name}`,
              content: cleanContent.slice(0, 150),
              referenceId: msg.id,
              referenceType: 'room',
              referenceSlug: room.slug,
            },
            trx
          );
        }
      }

      await this.chatRepo.incrementRoomMessageCount(room.id, trx);
      return msg;
    });

    const [hydrated] = await this.hydrateMessages([message]);

    // Real-Time Socket.IO Broadcast
    if (this.realtimeService) {
      // Broadcast to room channel (e.g. chat:global or chat:symbol:RELIANCE)
      const roomChannel =
        room.type === 'GLOBAL'
          ? 'chat:global'
          : `chat:symbol:${room.symbol || room.slug}`;

      this.realtimeService.emitChatMessageNew?.({
        eventId: `msg-${message.id}-${Date.now()}`,
        roomId: room.id,
        roomSlug: room.slug,
        message: hydrated,
        timestamp: new Date().toISOString(),
      });

      // Broadcast mentions directly to private user channels
      for (const u of validMentionedUsers) {
        this.realtimeService.emitChatNotificationNew?.({
          eventId: `notif-${Date.now()}-${u.id}`,
          notification: {
            id: Date.now(),
            userId: u.id,
            type: 'MENTION',
            title: `@${sender.username} mentioned you in #${room.name}`,
            content: cleanContent.slice(0, 150),
            referenceId: message.id,
            referenceType: 'room',
            referenceSlug: room.slug,
            isRead: false,
            createdAt: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    logger.debug(`[CHAT] Message #${message.id} sent by User #${senderId} in Room "${room.slug}"`);
    return hydrated;
  }

  // ==========================================================================
  // 2. Direct Messaging (1-on-1)
  // ==========================================================================

  async listUserConversations(userId: number): Promise<ChatConversation[]> {
    const records = await this.chatRepo.getUserConversations(userId);
    const conversations: ChatConversation[] = [];

    for (const rec of records) {
      const otherUserId = rec.user1_id === userId ? rec.user2_id : rec.user1_id;
      const otherUser = await this.userRepo.findById(otherUserId);
      if (!otherUser) continue;

      const participant = await this.chatRepo.getParticipant(rec.id, userId);
      const unreadCount = await this.chatRepo.countUnreadConversationMessages(
        rec.id,
        participant?.last_read_message_id || null,
        userId
      );

      const recentMessages = await this.chatRepo.listConversationMessages(rec.id, { limit: 1 });
      const lastMessage =
        recentMessages.length > 0 ? (await this.hydrateMessages(recentMessages))[0] : null;

      conversations.push({
        id: rec.id,
        user1Id: rec.user1_id,
        user2Id: rec.user2_id,
        otherUser: {
          id: otherUser.id,
          username: otherUser.username,
          role: otherUser.role,
        },
        lastMessage,
        lastMessageAt: rec.last_message_at ? rec.last_message_at.toISOString() : null,
        unreadCount,
        createdAt: rec.created_at.toISOString(),
        updatedAt: rec.updated_at.toISOString(),
      });
    }

    return conversations;
  }

  async getOrCreateConversation(
    user1Id: number,
    user2Id: number
  ): Promise<ChatConversation> {
    if (user1Id === user2Id) {
      throw new AppError(400, 'SELF_MESSAGING_PROHIBITED', 'You cannot message yourself');
    }

    const otherUser = await this.userRepo.findById(user2Id);
    if (!otherUser) {
      throw new AppError(404, 'USER_NOT_FOUND', `User #${user2Id} not found`);
    }

    // Check blocking restrictions
    const isBlocked = await this.chatRepo.isBlockedEitherWay(user1Id, user2Id);
    if (isBlocked) {
      throw new AppError(403, 'BLOCKED_BY_USER', 'Cannot start a conversation with a blocked user');
    }

    let conversation = await this.chatRepo.findConversationBetweenUsers(user1Id, user2Id);

    if (!conversation) {
      conversation = await this.chatRepo.transaction(async (trx) => {
        const conv = await this.chatRepo.createConversation(user1Id, user2Id, trx);
        await this.chatRepo.createParticipant(conv.id, user1Id, trx);
        await this.chatRepo.createParticipant(conv.id, user2Id, trx);
        return conv;
      });
    }

    const participant = await this.chatRepo.getParticipant(conversation.id, user1Id);
    const unreadCount = await this.chatRepo.countUnreadConversationMessages(
      conversation.id,
      participant?.last_read_message_id || null,
      user1Id
    );

    const recentMessages = await this.chatRepo.listConversationMessages(conversation.id, { limit: 1 });
    const lastMessage =
      recentMessages.length > 0 ? (await this.hydrateMessages(recentMessages))[0] : null;

    return {
      id: conversation.id,
      user1Id: conversation.user1_id,
      user2Id: conversation.user2_id,
      otherUser: {
        id: otherUser.id,
        username: otherUser.username,
        role: otherUser.role,
      },
      lastMessage,
      lastMessageAt: conversation.last_message_at
        ? conversation.last_message_at.toISOString()
        : null,
      unreadCount,
      createdAt: conversation.created_at.toISOString(),
      updatedAt: conversation.updated_at.toISOString(),
    };
  }

  async getConversationMessages(
    conversationId: number,
    userId: number,
    query: ChatPaginationQueryInput
  ): Promise<ChatMessage[]> {
    const conversation = await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    }

    // Strict membership guard: only the 2 participants can view messages
    if (conversation.user1_id !== userId && conversation.user2_id !== userId) {
      throw new AppError(403, 'UNAUTHORIZED', 'You are not a participant in this conversation');
    }

    const records = await this.chatRepo.listConversationMessages(conversationId, {
      limit: query.limit,
      beforeId: query.beforeId,
      afterId: query.afterId,
    });

    return this.hydrateMessages(records);
  }

  async sendDirectMessage(
    senderId: number,
    input: SendDirectMessageInput
  ): Promise<ChatMessage> {
    this.checkRateLimit(senderId);

    if (senderId === input.recipientId) {
      throw new AppError(400, 'SELF_MESSAGING_PROHIBITED', 'You cannot message yourself');
    }

    const recipient = await this.userRepo.findById(input.recipientId);
    if (!recipient) {
      throw new AppError(404, 'RECIPIENT_NOT_FOUND', `Recipient #${input.recipientId} not found`);
    }

    // Block check
    const isBlocked = await this.chatRepo.isBlockedEitherWay(senderId, input.recipientId);
    if (isBlocked) {
      throw new AppError(403, 'BLOCKED_BY_USER', 'Cannot send message to this user due to blocking controls');
    }

    const cleanContent = this.sanitizeContent(input.content);
    if (cleanContent.length === 0) {
      throw new AppError(400, 'EMPTY_MESSAGE', 'Message content cannot be empty');
    }

    // Idempotency check
    if (input.idempotencyKey) {
      const existing = await this.chatRepo.findMessageByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        const [hydrated] = await this.hydrateMessages([existing]);
        return hydrated;
      }
    }

    const sender = await this.userRepo.findById(senderId);
    if (!sender) {
      throw new AppError(401, 'USER_NOT_FOUND', 'Sender not found');
    }

    // Ensure conversation exists
    const conversation = await this.getOrCreateConversation(senderId, input.recipientId);

    const message = await this.chatRepo.transaction(async (trx) => {
      const msg = await this.chatRepo.createMessage(
        {
          conversationId: conversation.id,
          senderId,
          content: cleanContent,
          idempotencyKey: input.idempotencyKey || null,
        },
        trx
      );

      await this.chatRepo.updateConversationTimestamp(conversation.id, new Date(), trx);

      // Update sender's read cursor to this message
      await this.chatRepo.updateParticipantReadCursor(conversation.id, senderId, msg.id, trx);

      // Create notification for recipient
      await this.chatRepo.createNotification(
        {
          userId: input.recipientId,
          type: 'DIRECT_MESSAGE',
          title: `New message from @${sender.username}`,
          content: cleanContent.slice(0, 150),
          referenceId: conversation.id,
          referenceType: 'conversation',
        },
        trx
      );

      return msg;
    });

    const [hydrated] = await this.hydrateMessages([message]);

    // Real-Time Delivery
    if (this.realtimeService) {
      // Broadcast to private conversation room
      this.realtimeService.emitChatDirectMessage?.({
        eventId: `dm-${message.id}-${Date.now()}`,
        conversationId: conversation.id,
        message: hydrated,
        timestamp: new Date().toISOString(),
      });

      // Notify recipient's private user room
      this.realtimeService.emitChatNotificationNew?.({
        eventId: `notif-${Date.now()}-${input.recipientId}`,
        notification: {
          id: Date.now(),
          userId: input.recipientId,
          type: 'DIRECT_MESSAGE',
          title: `New message from @${sender.username}`,
          content: cleanContent.slice(0, 150),
          referenceId: conversation.id,
          referenceType: 'conversation',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    }

    logger.debug(
      `[CHAT] Direct message #${message.id} sent from User #${senderId} to User #${input.recipientId}`
    );
    return hydrated;
  }

  async markConversationRead(
    conversationId: number,
    userId: number,
    messageId?: number
  ): Promise<void> {
    const conversation = await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    }

    if (conversation.user1_id !== userId && conversation.user2_id !== userId) {
      throw new AppError(403, 'UNAUTHORIZED', 'You are not a participant in this conversation');
    }

    let targetMessageId = messageId;
    if (!targetMessageId) {
      const latest = await this.chatRepo.listConversationMessages(conversationId, { limit: 1 });
      targetMessageId = latest.length > 0 ? latest[0].id : 0;
    }

    await this.chatRepo.updateParticipantReadCursor(conversationId, userId, targetMessageId);

    if (this.realtimeService) {
      this.realtimeService.emitChatMessageRead?.({
        conversationId,
        userId,
        lastReadMessageId: targetMessageId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ==========================================================================
  // 3. User Autocomplete & Search
  // ==========================================================================

  async searchUsers(
    query: string,
    currentUserId: number,
    limit = 20
  ): Promise<{ id: number; username: string; role: string }[]> {
    const cleanQ = query.trim().toLowerCase();
    if (cleanQ.length === 0) return [];

    if (typeof (this.userRepo as any).searchUsers === 'function') {
      const results = await (this.userRepo as any).searchUsers(cleanQ, limit);
      return results
        .filter((u: any) => u.id !== currentUserId && u.role !== 'BOT')
        .map((u: any) => ({ id: u.id, username: u.username, role: u.role }));
    }

    // Use userRepo.findAll() and filter
    try {
      const allUsers = await this.userRepo.findAll(100);
      return allUsers
        .filter(
          (u) =>
            u.id !== currentUserId &&
            u.role !== 'BOT' &&
            u.username.toLowerCase().includes(cleanQ)
        )
        .slice(0, limit)
        .map((u) => ({ id: u.id, username: u.username, role: u.role }));
    } catch {
      const exact = await this.userRepo.findByUsername(cleanQ);
      if (exact && exact.id !== currentUserId && exact.role !== 'BOT') {
        return [{ id: exact.id, username: exact.username, role: exact.role }];
      }
      return [];
    }
  }

  // ==========================================================================
  // 4. Notifications
  // ==========================================================================

  async getUserNotifications(
    userId: number,
    options: { limit?: number; unreadOnly?: boolean } = {}
  ): Promise<{ notifications: ChatNotification[]; unreadCount: number }> {
    const [records, unreadCount] = await Promise.all([
      this.chatRepo.getUserNotifications(userId, options),
      this.chatRepo.countUnreadNotifications(userId),
    ]);

    const notifications: ChatNotification[] = records.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      content: r.content,
      referenceId: r.reference_id,
      referenceType: r.reference_type,
      referenceSlug: r.reference_slug,
      isRead: r.is_read,
      readAt: r.read_at ? r.read_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
    }));

    return { notifications, unreadCount };
  }

  async markNotificationRead(id: number, userId: number): Promise<void> {
    await this.chatRepo.markNotificationAsRead(id, userId);
  }

  async markAllNotificationsRead(userId: number): Promise<void> {
    await this.chatRepo.markAllNotificationsAsRead(userId);
  }

  // ==========================================================================
  // 5. User Blocking Controls
  // ==========================================================================

  async blockUser(blockerId: number, blockedId: number, reason?: string | null): Promise<ChatUserBlock> {
    if (blockerId === blockedId) {
      throw new AppError(400, 'SELF_BLOCK_PROHIBITED', 'You cannot block yourself');
    }

    const targetUser = await this.userRepo.findById(blockedId);
    if (!targetUser) {
      throw new AppError(404, 'USER_NOT_FOUND', `User #${blockedId} not found`);
    }

    const alreadyBlocked = await this.chatRepo.isUserBlocked(blockerId, blockedId);
    if (alreadyBlocked) {
      throw new AppError(409, 'ALREADY_BLOCKED', `User #${blockedId} is already blocked`);
    }

    const record = await this.chatRepo.createBlock(blockerId, blockedId, reason);
    logger.info(`[CHAT SAFETY] User #${blockerId} blocked User #${blockedId}`);

    return {
      id: record.id,
      blockerId: record.blocker_id,
      blockedId: record.blocked_id,
      blockedUsername: targetUser.username,
      reason: record.reason,
      createdAt: record.created_at.toISOString(),
    };
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<void> {
    const deleted = await this.chatRepo.deleteBlock(blockerId, blockedId);
    if (!deleted) {
      throw new AppError(404, 'BLOCK_NOT_FOUND', `User #${blockedId} is not in your block list`);
    }
    logger.info(`[CHAT SAFETY] User #${blockerId} unblocked User #${blockedId}`);
  }

  async listBlockedUsers(blockerId: number): Promise<ChatUserBlock[]> {
    const records = await this.chatRepo.listBlockedUsers(blockerId);
    const result: ChatUserBlock[] = [];

    for (const r of records) {
      const user = await this.userRepo.findById(r.blocked_id);
      result.push({
        id: r.id,
        blockerId: r.blocker_id,
        blockedId: r.blocked_id,
        blockedUsername: user?.username || `User #${r.blocked_id}`,
        reason: r.reason,
        createdAt: r.created_at.toISOString(),
      });
    }

    return result;
  }

  // ==========================================================================
  // 6. Community Reporting & Moderation
  // ==========================================================================

  async createReport(reporterId: number, input: CreateReportInput): Promise<ChatReport> {
    if (!input.reportedUserId && !input.messageId) {
      throw new AppError(400, 'INVALID_REPORT', 'Must report either a message or a user');
    }

    if (input.messageId) {
      const msg = await this.chatRepo.findMessageById(input.messageId);
      if (!msg) {
        throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Reported message not found');
      }
      if (!input.reportedUserId) {
        input.reportedUserId = msg.sender_id;
      }
    }

    const report = await this.chatRepo.createReport({
      reporterId,
      reportedUserId: input.reportedUserId || null,
      messageId: input.messageId || null,
      reason: input.reason,
      description: input.description || null,
    });

    logger.warn(
      `[CHAT MODERATION] New report #${report.id} filed by User #${reporterId} against ${
        input.reportedUserId ? `User #${input.reportedUserId}` : 'content'
      } (${input.reason})`
    );

    return (await this.hydrateReports([report]))[0];
  }

  async listReports(options: {
    status?: ChatReportStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: ChatReport[]; total: number }> {
    const res = await this.chatRepo.listReports(options);
    const hydrated = await this.hydrateReports(res.reports);
    return { reports: hydrated, total: res.total };
  }

  async reviewReport(
    reportId: number,
    reviewerId: number,
    input: ReviewReportInput
  ): Promise<ChatReport> {
    const report = await this.chatRepo.findReportById(reportId);
    if (!report) {
      throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
    }

    // Execute requested moderation action
    if (input.action === 'DELETE_MESSAGE' && report.message_id) {
      await this.chatRepo.softDeleteMessage(report.message_id);
      logger.info(`[CHAT MODERATION] Message #${report.message_id} soft-deleted by Admin #${reviewerId}`);
    }

    const updated = await this.chatRepo.updateReportStatus(reportId, input.status, reviewerId);
    return (await this.hydrateReports([updated!]))[0];
  }

  // ==========================================================================
  // Helper Mappers & Hydrators
  // ==========================================================================

  private mapRoomRecord(r: ChatRoomRecord): ChatRoom {
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      type: r.type,
      symbol: r.symbol,
      description: r.description,
      isActive: Boolean(r.is_active),
      messageCount: r.message_count,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  private async hydrateMessages(records: ChatMessageRecord[]): Promise<ChatMessage[]> {
    const userIds = Array.from(new Set(records.map((r) => r.sender_id)));
    const userMap = new Map<number, { username: string; role: any }>();

    for (const uid of userIds) {
      const u = await this.userRepo.findById(uid);
      if (u) {
        userMap.set(uid, { username: u.username, role: u.role });
      }
    }

    return records.map((r) => {
      const u = userMap.get(r.sender_id);
      return {
        id: r.id,
        roomId: r.room_id,
        conversationId: r.conversation_id,
        senderId: r.sender_id,
        senderUsername: u?.username || `User #${r.sender_id}`,
        senderRole: u?.role,
        content: r.content,
        idempotencyKey: r.idempotency_key,
        isDeleted: Boolean(r.is_deleted),
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      };
    });
  }

  private async hydrateReports(records: any[]): Promise<ChatReport[]> {
    const result: ChatReport[] = [];

    for (const r of records) {
      const [reporter, reportedUser, message] = await Promise.all([
        this.userRepo.findById(r.reporter_id),
        r.reported_user_id ? this.userRepo.findById(r.reported_user_id) : null,
        r.message_id ? this.chatRepo.findMessageById(r.message_id) : null,
      ]);

      result.push({
        id: r.id,
        reporterId: r.reporter_id,
        reporterUsername: reporter?.username || `User #${r.reporter_id}`,
        reportedUserId: r.reported_user_id,
        reportedUsername: reportedUser?.username || (r.reported_user_id ? `User #${r.reported_user_id}` : undefined),
        messageId: r.message_id,
        messageContent: message?.content,
        reason: r.reason,
        description: r.description,
        status: r.status,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      });
    }

    return result;
  }
}
