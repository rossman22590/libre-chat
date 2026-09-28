import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IBalance } from '..';
import type { ITransaction } from '~/schema/transaction';
import { matchModelName, findMatchingPattern } from './test-helpers';
import { createTransactionMethods } from './transaction';
import { createTxMethods } from './tx';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const HOUR = 60 * 60 * 1000;
const WINDOW = 24 * HOUR;
const ALLOTMENT = 200000;

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Balance: mongoose.Model<IBalance>;
let Transaction: mongoose.Model<ITransaction>;
let methods: ReturnType<typeof createTransactionMethods>;

const userId = new mongoose.Types.ObjectId().toString();
const claim = (now: Date, perDay = 2) =>
  methods.claimUsageReset({ user: userId, allotment: ALLOTMENT, perDay, windowMs: WINDOW, now });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  Object.assign(mongoose.models, createModels(mongoose));
  Balance = mongoose.models.Balance;
  Transaction = mongoose.models.Transaction;
  const txMethods = createTxMethods(mongoose, { matchModelName, findMatchingPattern });
  methods = createTransactionMethods(mongoose, {
    getMultiplier: txMethods.getMultiplier,
    getCacheMultiplier: txMethods.getCacheMultiplier,
  });
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Balance.create({ user: userId, tokenCredits: 1000 });
});

describe('claimUsageReset', () => {
  it('restores the balance to the allotment and records a transaction', async () => {
    const result = await claim(new Date());

    expect(result?.source).toBe('daily');
    expect(result?.balance.tokenCredits).toBe(ALLOTMENT);
    const balance = await Balance.findOne({ user: userId }).lean();
    expect(balance?.tokenCredits).toBe(ALLOTMENT);
    expect(balance?.usageResets).toHaveLength(1);
    const tx = await Transaction.findOne({ user: userId, context: 'usageReset' }).lean();
    expect(tx?.rawAmount).toBe(ALLOTMENT - 1000);
  });

  it('refuses when the balance is already at the allotment', async () => {
    await Balance.updateOne({ user: userId }, { $set: { tokenCredits: ALLOTMENT } });
    expect(await claim(new Date())).toBeNull();
    expect(await Transaction.countDocuments({ user: userId })).toBe(0);
  });

  it('allows perDay resets per window, then frees a slot once the oldest expires', async () => {
    const start = new Date('2026-01-01T09:00:00Z');
    const spend = () => Balance.updateOne({ user: userId }, { $set: { tokenCredits: 0 } });

    expect(await claim(start)).not.toBeNull();
    await spend();
    expect(await claim(new Date(start.getTime() + 8 * HOUR))).not.toBeNull();
    await spend();
    expect(await claim(new Date(start.getTime() + 12 * HOUR))).toBeNull();
    expect(await claim(new Date(start.getTime() + 24 * HOUR + 1))).not.toBeNull();

    const balance = await Balance.findOne({ user: userId }).lean();
    expect(balance?.usageResets).toHaveLength(2);
  });

  it('falls back to bonus resets once daily resets are used up', async () => {
    const now = new Date();
    await methods.grantUsageResets(userId, 1);

    expect((await claim(now, 0))?.source).toBe('bonus');
    const balance = await Balance.findOne({ user: userId }).lean();
    expect(balance?.bonusResets).toBe(0);
    await Balance.updateOne({ user: userId }, { $set: { tokenCredits: 0 } });
    expect(await claim(now, 0)).toBeNull();
  });

  it('never exceeds perDay under concurrent claims', async () => {
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 5 }, () => claim(now, 1)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('grantUsageResets', () => {
  it('adds resets and floors revocations at zero', async () => {
    expect((await methods.grantUsageResets(userId, 3))?.bonusResets).toBe(3);
    expect((await methods.grantUsageResets(userId, -10))?.bonusResets).toBe(0);
  });

  it('returns null without a balance record', async () => {
    const other = new mongoose.Types.ObjectId().toString();
    expect(await methods.grantUsageResets(other, 1)).toBeNull();
  });
});
