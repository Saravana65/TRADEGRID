import { Knex } from 'knex';
import { db as defaultDb } from '../../database/connection';
import {
  IChatRepository,
  ChatRoomRecord,
  ChatConversationRecord,
  ChatConversationParticipantRecord,
  ChatMessageRecord,
  ChatMessageMentionRecord,
  ChatNotificationRecord,
  ChatUserBlockRecord,
  ChatReportRecord,
} from './chat.types';
import { ChatRoomType, ChatReportReason, ChatReportStatus } from '@tradegrid/shared-types';

export class ChatRepository implements IChatRepository {
  constructor(private db: Knex = defaultDb) {}

  async transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }

  // ==========================================================================
  // Chat Rooms
  // ==========================================================================

  async findRooms(): Promise<ChatRoomRecord[]> {
    return this.db('chat_rooms')
      .where({ is_active: true })
      .orderBy('type', 'asc')
      .orderBy('name', 'asc');
  }

  async findRoomById(id: number, trx?: Knex.Transaction): Promise<ChatRoomRecord | null> {
    const q = (trx || this.db)('chat_rooms').where({ id }).first();
    const res = await q;
    return res || null;
  }

  async findRoomBySlug(slug: string, trx?: Knex.Transaction): Promise<ChatRoomRecord | null> {
    const q = (trx || this.db)('chat_rooms').where({ slug }).first();
    const res = await q;
    return res || null;
  }

  async findRoomBySymbol(symbol: string, trx?: Knex.Transaction): Promise<ChatRoomRecord | null> {
    const q = (trx || this.db)('chat_rooms')
      .whereRaw('UPPER(symbol) = ?', [symbol.toUpperCase()])
      .first();
    const res = await q;
    return res || null;
  }

  async createRoom(
    data: {
      slug: string;
      name: string;
      type: ChatRoomType;
      symbol?: string | null;
      description?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<ChatRoomRecord> {
    const client = trx || this.db;
    const [id] = await client('chat_rooms').insert({
      slug: data.slug,
      name: data.name,
      type: data.type,
      symbol: data.symbol ? data.symbol.toUpperCase() : null,
      description: data.description || null,
      is_active: true,
      message_count: 0,
    });
    return (await this.findRoomById(id, trx))!;
  }

  async incrementRoomMessageCount(roomId: number, trx?: Knex.Transaction): Promise<void> {
    const client = trx || this.db;
    await client('chat_rooms')
      .where({ id: roomId })
      .increment('message_count', 1);
  }

  // ==========================================================================
  // Conversations
  // ==========================================================================

  async findConversationById(
    id: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationRecord | null> {
    const q = (trx || this.db)('chat_conversations').where({ id }).first();
    const res = await q;
    return res || null;
  }

  async findConversationBetweenUsers(
    user1Id: number,
    user2Id: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationRecord | null> {
    const u1 = Math.min(user1Id, user2Id);
    const u2 = Math.max(user1Id, user2Id);
    const q = (trx || this.db)('chat_conversations')
      .where({ user1_id: u1, user2_id: u2 })
      .first();
    const res = await q;
    return res || null;
  }

  async getUserConversations(userId: number): Promise<ChatConversationRecord[]> {
    return this.db('chat_conversations')
      .where({ user1_id: userId })
      .orWhere({ user2_id: userId })
      .orderByRaw('COALESCE(last_message_at, updated_at) DESC');
  }

  async createConversation(
    user1Id: number,
    user2Id: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationRecord> {
    const client = trx || this.db;
    const u1 = Math.min(user1Id, user2Id);
    const u2 = Math.max(user1Id, user2Id);

    const [id] = await client('chat_conversations').insert({
      user1_id: u1,
      user2_id: u2,
      last_message_at: client.fn.now(),
    });

    return (await this.findConversationById(id, trx))!;
  }

  async updateConversationTimestamp(
    conversationId: number,
    lastMessageAt: Date,
    trx?: Knex.Transaction
  ): Promise<void> {
    const client = trx || this.db;
    await client('chat_conversations')
      .where({ id: conversationId })
      .update({
        last_message_at: lastMessageAt,
        updated_at: client.fn.now(),
      });
  }

  // ==========================================================================
  // Participants
  // ==========================================================================

  async getParticipants(conversationId: number): Promise<ChatConversationParticipantRecord[]> {
    return this.db('chat_conversation_participants').where({ conversation_id: conversationId });
  }

  async getParticipant(
    conversationId: number,
    userId: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationParticipantRecord | null> {
    const q = (trx || this.db)('chat_conversation_participants')
      .where({ conversation_id: conversationId, user_id: userId })
      .first();
    const res = await q;
    return res || null;
  }

  async createParticipant(
    conversationId: number,
    userId: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationParticipantRecord> {
    const client = trx || this.db;
    const [id] = await client('chat_conversation_participants').insert({
      conversation_id: conversationId,
      user_id: userId,
      last_read_message_id: null,
      last_read_at: client.fn.now(),
    });
    const res = await client('chat_conversation_participants').where({ id }).first();
    return res!;
  }

  async updateParticipantReadCursor(
    conversationId: number,
    userId: number,
    lastReadMessageId: number,
    trx?: Knex.Transaction
  ): Promise<void> {
    const client = trx || this.db;
    await client('chat_conversation_participants')
      .where({ conversation_id: conversationId, user_id: userId })
      .update({
        last_read_message_id: lastReadMessageId,
        last_read_at: client.fn.now(),
      });
  }

  // ==========================================================================
  // Messages
  // ==========================================================================

  async findMessageById(id: number, trx?: Knex.Transaction): Promise<ChatMessageRecord | null> {
    const q = (trx || this.db)('chat_messages').where({ id }).first();
    const res = await q;
    return res || null;
  }

  async findMessageByIdempotencyKey(
    idempotencyKey: string,
    trx?: Knex.Transaction
  ): Promise<ChatMessageRecord | null> {
    const q = (trx || this.db)('chat_messages').where({ idempotency_key: idempotencyKey }).first();
    const res = await q;
    return res || null;
  }

  async listRoomMessages(
    roomId: number,
    options: { limit?: number; beforeId?: number; afterId?: number } = {}
  ): Promise<ChatMessageRecord[]> {
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    let q = this.db('chat_messages')
      .where({ room_id: roomId, is_deleted: false });

    if (options.beforeId) {
      q = q.where('id', '<', options.beforeId);
    }
    if (options.afterId) {
      q = q.where('id', '>', options.afterId);
    }

    return q.orderBy('id', 'desc').limit(limit);
  }

  async listConversationMessages(
    conversationId: number,
    options: { limit?: number; beforeId?: number; afterId?: number } = {}
  ): Promise<ChatMessageRecord[]> {
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    let q = this.db('chat_messages')
      .where({ conversation_id: conversationId, is_deleted: false });

    if (options.beforeId) {
      q = q.where('id', '<', options.beforeId);
    }
    if (options.afterId) {
      q = q.where('id', '>', options.afterId);
    }

    return q.orderBy('id', 'desc').limit(limit);
  }

  async countUnreadConversationMessages(
    conversationId: number,
    lastReadMessageId: number | null,
    userId: number
  ): Promise<number> {
    let q = this.db('chat_messages')
      .where({ conversation_id: conversationId, is_deleted: false })
      .whereNot({ sender_id: userId });

    if (lastReadMessageId) {
      q = q.where('id', '>', lastReadMessageId);
    }

    const res = await q.count<{ count: number | string }>('id as count').first();
    return Number(res?.count || 0);
  }

  async createMessage(
    data: {
      roomId?: number | null;
      conversationId?: number | null;
      senderId: number;
      content: string;
      idempotencyKey?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<ChatMessageRecord> {
    const client = trx || this.db;
    const [id] = await client('chat_messages').insert({
      room_id: data.roomId || null,
      conversation_id: data.conversationId || null,
      sender_id: data.senderId,
      content: data.content,
      idempotency_key: data.idempotencyKey || null,
      is_deleted: false,
    });
    return (await this.findMessageById(id, trx))!;
  }

  async softDeleteMessage(id: number, trx?: Knex.Transaction): Promise<void> {
    const client = trx || this.db;
    await client('chat_messages').where({ id }).update({
      is_deleted: true,
      content: '[Message deleted by moderator]',
      updated_at: client.fn.now(),
    });
  }

  // ==========================================================================
  // Mentions
  // ==========================================================================

  async createMentions(
    mentions: {
      messageId: number;
      mentionedUserId: number;
      roomId?: number | null;
      conversationId?: number | null;
    }[],
    trx?: Knex.Transaction
  ): Promise<void> {
    if (mentions.length === 0) return;
    const client = trx || this.db;
    await client('chat_message_mentions').insert(
      mentions.map((m) => ({
        message_id: m.messageId,
        mentioned_user_id: m.mentionedUserId,
        room_id: m.roomId || null,
        conversation_id: m.conversationId || null,
      }))
    );
  }

  async getUserMentions(userId: number, limit = 50): Promise<ChatMessageMentionRecord[]> {
    return this.db('chat_message_mentions')
      .where({ mentioned_user_id: userId })
      .orderBy('id', 'desc')
      .limit(limit);
  }

  // ==========================================================================
  // Notifications
  // ==========================================================================

  async createNotification(
    data: {
      userId: number;
      type: 'MENTION' | 'DIRECT_MESSAGE' | 'SYSTEM';
      title: string;
      content: string;
      referenceId?: number | null;
      referenceType?: string | null;
      referenceSlug?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<ChatNotificationRecord> {
    const client = trx || this.db;
    const [id] = await client('chat_notifications').insert({
      user_id: data.userId,
      type: data.type,
      title: data.title,
      content: data.content,
      reference_id: data.referenceId || null,
      reference_type: data.referenceType || null,
      reference_slug: data.referenceSlug || null,
      is_read: false,
    });
    const res = await client('chat_notifications').where({ id }).first();
    return res!;
  }

  async getUserNotifications(
    userId: number,
    options: { limit?: number; unreadOnly?: boolean } = {}
  ): Promise<ChatNotificationRecord[]> {
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    let q = this.db('chat_notifications').where({ user_id: userId });

    if (options.unreadOnly) {
      q = q.where({ is_read: false });
    }

    return q.orderBy('id', 'desc').limit(limit);
  }

  async countUnreadNotifications(userId: number): Promise<number> {
    const res = await this.db('chat_notifications')
      .where({ user_id: userId, is_read: false })
      .count<{ count: number | string }>('id as count')
      .first();
    return Number(res?.count || 0);
  }

  async markNotificationAsRead(id: number, userId: number, trx?: Knex.Transaction): Promise<void> {
    const client = trx || this.db;
    await client('chat_notifications')
      .where({ id, user_id: userId })
      .update({
        is_read: true,
        read_at: client.fn.now(),
      });
  }

  async markAllNotificationsAsRead(userId: number, trx?: Knex.Transaction): Promise<void> {
    const client = trx || this.db;
    await client('chat_notifications')
      .where({ user_id: userId, is_read: false })
      .update({
        is_read: true,
        read_at: client.fn.now(),
      });
  }

  // ==========================================================================
  // Blocks
  // ==========================================================================

  async isUserBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    const res = await this.db('chat_user_blocks')
      .where({ blocker_id: blockerId, blocked_id: blockedId })
      .first();
    return !!res;
  }

  async isBlockedEitherWay(userA: number, userB: number): Promise<boolean> {
    const res = await this.db('chat_user_blocks')
      .where(function () {
        this.where({ blocker_id: userA, blocked_id: userB }).orWhere({
          blocker_id: userB,
          blocked_id: userA,
        });
      })
      .first();
    return !!res;
  }

  async listBlockedUsers(blockerId: number): Promise<ChatUserBlockRecord[]> {
    return this.db('chat_user_blocks')
      .where({ blocker_id: blockerId })
      .orderBy('created_at', 'desc');
  }

  async createBlock(
    blockerId: number,
    blockedId: number,
    reason?: string | null
  ): Promise<ChatUserBlockRecord> {
    await this.db('chat_user_blocks').insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason: reason || null,
    });
    const res = await this.db('chat_user_blocks')
      .where({ blocker_id: blockerId, blocked_id: blockedId })
      .first();
    return res!;
  }

  async deleteBlock(blockerId: number, blockedId: number): Promise<boolean> {
    const deleted = await this.db('chat_user_blocks')
      .where({ blocker_id: blockerId, blocked_id: blockedId })
      .del();
    return deleted > 0;
  }

  // ==========================================================================
  // Reports & Moderation
  // ==========================================================================

  async createReport(
    data: {
      reporterId: number;
      reportedUserId?: number | null;
      messageId?: number | null;
      reason: ChatReportReason;
      description?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<ChatReportRecord> {
    const client = trx || this.db;
    const [id] = await client('chat_reports').insert({
      reporter_id: data.reporterId,
      reported_user_id: data.reportedUserId || null,
      message_id: data.messageId || null,
      reason: data.reason,
      description: data.description || null,
      status: 'PENDING',
    });
    return (await this.findReportById(id))!;
  }

  async listReports(
    options: {
      status?: ChatReportStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ reports: ChatReportRecord[]; total: number }> {
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = Math.max(0, options.offset || 0);

    let query = this.db('chat_reports');
    let countQuery = this.db('chat_reports');

    if (options.status) {
      query = query.where({ status: options.status });
      countQuery = countQuery.where({ status: options.status });
    }

    const [reports, totalRes] = await Promise.all([
      query.orderBy('created_at', 'desc').limit(limit).offset(offset),
      countQuery.count<{ count: number | string }>('id as count').first(),
    ]);

    return {
      reports,
      total: Number(totalRes?.count || 0),
    };
  }

  async findReportById(id: number): Promise<ChatReportRecord | null> {
    const res = await this.db('chat_reports').where({ id }).first();
    return res || null;
  }

  async updateReportStatus(
    id: number,
    status: ChatReportStatus,
    reviewedBy: number,
    trx?: Knex.Transaction
  ): Promise<ChatReportRecord | null> {
    const client = trx || this.db;
    await client('chat_reports')
      .where({ id })
      .update({
        status,
        reviewed_by: reviewedBy,
        reviewed_at: client.fn.now(),
        updated_at: client.fn.now(),
      });
    return this.findReportById(id);
  }
}

export const chatRepo = new ChatRepository();
