import type { IConversation, IMessage } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import { createConversationExportService } from './export';

const conversation = (conversationId: string, overrides: Partial<IConversation> = {}) =>
  ({
    _id: `objectid-${conversationId}`,
    __v: 0,
    user: 'user-1',
    conversationId,
    title: `Title ${conversationId}`,
    endpoint: 'openAI',
    model: 'gpt-4o',
    temperature: 0.7,
    messages: ['message-objectid'],
    files: ['file-1'],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...overrides,
  }) as unknown as IConversation;

const message = (conversationId: string, messageId: string) =>
  ({
    _id: `objectid-${messageId}`,
    __v: 0,
    user: 'user-1',
    conversationId,
    messageId,
    text: `text ${messageId}`,
    isCreatedByUser: true,
  }) as unknown as IMessage;

const createService = (conversations: IConversation[], messages: IMessage[]) => {
  const getMessages = jest.fn(async (filter: FilterQuery<IMessage>) =>
    messages.filter(
      (item) => !filter.conversationId || item.conversationId === filter.conversationId,
    ),
  );
  const service = createConversationExportService({
    getConvo: async (_user, conversationId) =>
      conversations.find((item) => item.conversationId === conversationId) ?? null,
    getConvosForExport: async () => conversations,
    getMessages,
  });
  return { service, getMessages };
};

describe('createConversationExportService', () => {
  describe('exportConversation', () => {
    it('returns the conversation in the LibreChat import format', async () => {
      const { service } = createService(
        [conversation('convo-1')],
        [message('convo-1', 'msg-1'), message('convo-2', 'msg-2')],
      );

      const result = await service.exportConversation('user-1', 'convo-1');

      expect(result).toMatchObject({
        conversationId: 'convo-1',
        endpoint: 'openAI',
        title: 'Title convo-1',
        branches: true,
        recursive: false,
      });
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0].messageId).toBe('msg-1');
    });

    it('omits owner-specific and regenerated fields', async () => {
      const { service } = createService([conversation('convo-1')], [message('convo-1', 'msg-1')]);

      const result = await service.exportConversation('user-1', 'convo-1');

      expect(result?.options).toEqual({ model: 'gpt-4o', temperature: 0.7 });
      expect(result?.messages[0]).not.toHaveProperty('_id');
      expect(result?.messages[0]).not.toHaveProperty('user');
    });

    it('returns null when the conversation does not belong to the user', async () => {
      const { service } = createService([conversation('convo-1')], []);

      await expect(service.exportConversation('user-1', 'missing')).resolves.toBeNull();
    });
  });

  describe('exportAllConversations', () => {
    it('groups messages by conversation with a single messages query', async () => {
      const { service, getMessages } = createService(
        [conversation('convo-1'), conversation('convo-2'), conversation('convo-3')],
        [
          message('convo-1', 'msg-1'),
          message('convo-2', 'msg-2'),
          message('convo-1', 'msg-3'),
          message('convo-2', 'msg-4'),
        ],
      );

      const result = await service.exportAllConversations('user-1');

      expect(getMessages).toHaveBeenCalledTimes(1);
      expect(getMessages).toHaveBeenCalledWith({ user: 'user-1' });
      expect(result).toHaveLength(3);
      expect(result[0].messages.map((item) => item.messageId)).toEqual(['msg-1', 'msg-3']);
      expect(result[1].messages.map((item) => item.messageId)).toEqual(['msg-2', 'msg-4']);
      expect(result[2].messages).toEqual([]);
    });

    it('returns an empty array and skips the messages query when there are no conversations', async () => {
      const { service, getMessages } = createService([], []);

      await expect(service.exportAllConversations('user-1')).resolves.toEqual([]);
      expect(getMessages).not.toHaveBeenCalled();
    });
  });
});
