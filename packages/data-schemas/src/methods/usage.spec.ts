import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createUsageMethods } from './usage';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const HOUR = 60 * 60 * 1000;

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let methods: ReturnType<typeof createUsageMethods>;

const userId = new mongoose.Types.ObjectId();
const user = userId.toString();
const now = Date.now();
const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR);

type RawTx = {
  tokenType: 'prompt' | 'completion' | 'credits';
  rawAmount: number;
  tokenValue: number;
  createdAt: Date;
  model?: string;
  context?: string;
  messageId?: string;
  conversationId?: string;
  readTokens?: number;
};

const chatTurn = (
  messageId: string,
  conversationId: string,
  model: string,
  hoursAgo: number,
  cost: { input: number; output: number },
): RawTx[] => [
  {
    tokenType: 'prompt',
    rawAmount: -1000,
    tokenValue: -cost.input,
    model,
    context: 'message',
    messageId,
    conversationId,
    readTokens: 200,
    createdAt: at(hoursAgo),
  },
  {
    tokenType: 'completion',
    rawAmount: -100,
    tokenValue: -cost.output,
    model,
    context: 'message',
    messageId,
    conversationId,
    createdAt: at(hoursAgo),
  },
];

async function seed(rows: RawTx[]) {
  await mongoose.models.Transaction.collection.insertMany(
    rows.map((row) => ({ ...row, user: userId, updatedAt: row.createdAt })),
  );
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  Object.assign(mongoose.models, createModels(mongoose));
  methods = createUsageMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.models.Conversation.create({
    conversationId: 'convo-a',
    user,
    title: 'Trip planning',
    endpoint: 'openAI',
  });
  await seed([
    ...chatTurn('m1', 'convo-a', 'anthropic/claude-sonnet-5', 1, { input: 3000, output: 1500 }),
    ...chatTurn('m2', 'convo-a', 'anthropic/claude-sonnet-5', 2, { input: 3000, output: 1500 }),
    ...chatTurn('m3', 'convo-b', 'openai/gpt-5', 3, { input: 500, output: 500 }),
    {
      tokenType: 'credits',
      rawAmount: 2500000,
      tokenValue: 15000000,
      context: 'autoRefill',
      createdAt: at(4),
    },
    { tokenType: 'credits', rawAmount: 1000, tokenValue: 1000, context: 'admin', createdAt: at(5) },
    ...chatTurn('old', 'convo-a', 'openai/gpt-5', 24 * 40, { input: 9999, output: 9999 }),
  ]);
});

describe('getUsageSummary', () => {
  const summarize = () =>
    methods.getUsageSummary({
      user,
      since: at(24 * 30),
      timezone: 'UTC',
      granularity: 'day',
    });

  it('totals spend and grants inside the window only', async () => {
    const { totals, grants } = await summarize();
    expect(totals).toEqual({
      spentCredits: 10000,
      addedCredits: 2501000,
      inputTokens: 3000,
      outputTokens: 300,
      messageCount: 3,
      conversationCount: 2,
    });
    expect(grants).toEqual([
      { context: 'autoRefill', credits: 2500000, count: 1 },
      { context: 'admin', credits: 1000, count: 1 },
    ]);
  });

  it('ranks models by spend with per-model message counts', async () => {
    const { models } = await summarize();
    expect(models.map((m) => [m.model, m.spentCredits, m.messageCount])).toEqual([
      ['anthropic/claude-sonnet-5', 9000, 2],
      ['openai/gpt-5', 1000, 1],
    ]);
    expect(models[0]).toMatchObject({ inputCredits: 6000, outputCredits: 3000 });
  });

  it('ranks chats with titles and their top model', async () => {
    const { chats } = await summarize();
    expect(chats[0]).toMatchObject({
      conversationId: 'convo-a',
      title: 'Trip planning',
      spentCredits: 9000,
      messageCount: 2,
      topModel: 'anthropic/claude-sonnet-5',
    });
    expect(chats[1]).toMatchObject({ conversationId: 'convo-b', title: undefined });
  });
});

describe('getUsageActivity', () => {
  it('merges each message into one item and keeps grants separate', async () => {
    const { items, nextCursor } = await methods.getUsageActivity({ user, kind: 'all', limit: 10 });
    const credit = expect.any(String);
    expect(items.map((i) => i.id)).toEqual(['m1', 'm2', 'm3', credit, credit, 'old']);
    expect(items[0]).toMatchObject({
      type: 'chat',
      title: 'Trip planning',
      spentCredits: 4500,
      inputTokens: 1000,
      outputTokens: 100,
      cachedTokens: 200,
      models: ['anthropic/claude-sonnet-5'],
    });
    expect(items[3]).toMatchObject({
      type: 'credit',
      context: 'autoRefill',
      addedCredits: 2500000,
    });
    expect(nextCursor).toBeNull();
  });

  it('filters to grants only', async () => {
    const { items } = await methods.getUsageActivity({ user, kind: 'added', limit: 10 });
    expect(items.map((i) => i.context)).toEqual(['autoRefill', 'admin']);
  });

  it('pages with a cursor without splitting or repeating messages', async () => {
    const first = await methods.getUsageActivity({ user, kind: 'spent', limit: 2 });
    expect(first.items.map((i) => i.id)).toEqual(['m1', 'm2']);
    expect(first.nextCursor).not.toBeNull();

    const second = await methods.getUsageActivity({
      user,
      kind: 'spent',
      limit: 2,
      before: new Date(first.nextCursor as string),
    });
    expect(second.items.map((i) => i.id)).toEqual(['m3', 'old']);
    expect(second.items[0].spentCredits).toBe(1000);
  });
});
