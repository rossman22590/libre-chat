import type { IConversation, IMessage } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';

/** Fields that are either owner-specific or regenerated on import, so they are never exported */
const OMITTED_CONVERSATION_FIELDS = [
  '_id',
  '__v',
  'user',
  'tenantId',
  'expiredAt',
  'messages',
  'files',
  'conversationId',
  'title',
  'endpoint',
  'createdAt',
  'updatedAt',
] as const;

const OMITTED_MESSAGE_FIELDS = ['_id', '__v', 'user', 'tenantId', 'expiredAt'] as const;

export type ExportedConversation = {
  conversationId: string;
  endpoint: string | null;
  title: string;
  exportAt: string;
  branches: boolean;
  recursive: boolean;
  options: Partial<IConversation>;
  messages: Partial<IMessage>[];
};

export interface ConversationExportDeps {
  getConvo: (user: string, conversationId: string) => Promise<IConversation | null>;
  getConvosForExport: (user: string) => Promise<IConversation[]>;
  getMessages: (filter: FilterQuery<IMessage>) => Promise<IMessage[]>;
}

const omitFields = <T extends object>(source: T, fields: readonly string[]): Partial<T> => {
  const omitted = new Set<string>(fields);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (omitted.has(key)) {
      continue;
    }
    result[key] = value;
  }
  return result as Partial<T>;
};

const toExportedConversation = (
  conversation: IConversation,
  messages: IMessage[],
  exportAt: string,
): ExportedConversation => ({
  conversationId: conversation.conversationId,
  endpoint: conversation.endpoint ?? null,
  title: conversation.title ?? 'Untitled',
  exportAt,
  branches: true,
  recursive: false,
  options: omitFields(conversation, OMITTED_CONVERSATION_FIELDS),
  messages: messages.map((message) => omitFields(message, OMITTED_MESSAGE_FIELDS)),
});

export function createConversationExportService(deps: ConversationExportDeps) {
  const { getConvo, getConvosForExport, getMessages } = deps;

  /** Exports a single conversation in the LibreChat import format */
  async function exportConversation(
    user: string,
    conversationId: string,
  ): Promise<ExportedConversation | null> {
    const conversation = await getConvo(user, conversationId);
    if (!conversation) {
      return null;
    }

    const messages = await getMessages({ user, conversationId });
    return toExportedConversation(conversation, messages, new Date().toISOString());
  }

  /**
   * Exports every conversation owned by the user as an array of LibreChat-format
   * conversations. All messages are fetched in a single query and grouped by
   * conversation to avoid one round trip per conversation.
   */
  async function exportAllConversations(user: string): Promise<ExportedConversation[]> {
    const conversations = await getConvosForExport(user);
    if (!conversations.length) {
      return [];
    }

    const messages = await getMessages({ user });
    const messagesByConvo = new Map<string, IMessage[]>();
    for (const message of messages) {
      const existing = messagesByConvo.get(message.conversationId);
      if (existing) {
        existing.push(message);
        continue;
      }
      messagesByConvo.set(message.conversationId, [message]);
    }

    const exportAt = new Date().toISOString();
    return conversations.map((conversation) =>
      toExportedConversation(
        conversation,
        messagesByConvo.get(conversation.conversationId) ?? [],
        exportAt,
      ),
    );
  }

  return { exportConversation, exportAllConversations };
}
