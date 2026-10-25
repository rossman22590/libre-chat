const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const {
  isEnabled,
  invalidateCachedAuthUserDoc,
  getAppConfigOptionsFromUser,
} = require('@librechat/api');
const { CacheKeys, SystemRoles, ViolationTypes } = require('librechat-data-provider');
const { User, Balance, Conversation, Message, Transaction } = require('~/db/models');
const { deleteUserAccount } = require('~/server/controllers/UserController');
const { clearUserBanCache } = require('~/server/middleware/checkBan');
const { getAppConfig } = require('~/server/services/Config');
const getLogStores = require('~/cache/getLogStores');
const db = require('~/models');

const MAX_BAN_MINUTES = 100 * 365 * 24 * 60;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const TRANSACTIONS_DAYS = 40;
const USD_PER_CREDIT = 0.000001;
const DEFAULT_CONVERSATION_LIMIT = 25;
const MAX_CONVERSATION_LIMIT = 100;
const CONVERSATION_SORT_FIELDS = new Set(['title', 'createdAt', 'updatedAt']);
const CONVERSATION_SELECT_FIELDS =
  'conversationId endpoint title createdAt updatedAt user model agent_id assistant_id spec iconURL';

function getTransactionsSince(date = new Date()) {
  const since = new Date(date);
  since.setDate(since.getDate() - TRANSACTIONS_DAYS);
  return since;
}

async function getStats(req, res) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, recentSignups] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    ]);

    res.status(200).json({ totalUsers, recentSignups });
  } catch {
    res.status(500).json({ error: 'Failed to load stats' });
  }
}

const ALLOWED_SORT_FIELDS = [
  'email',
  'name',
  'role',
  'createdAt',
  'tokenCredits',
  'conversationCount',
];
const DEFAULT_SORT_FIELD = 'createdAt';
const MAX_USERS_FOR_JOIN_SORT = 5000;

function parseSort(req) {
  const sortBy = ALLOWED_SORT_FIELDS.includes(req.query.sortBy)
    ? req.query.sortBy
    : DEFAULT_SORT_FIELD;
  const dir = req.query.sortDirection === 'asc' ? 1 : -1;
  return { sortBy, sortDirection: dir };
}

async function listUsers(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * pageSize;
    const search = (req.query.search || '').trim().toLowerCase();
    const { sortBy, sortDirection } = parseSort(req);

    const filter = {};
    if (search) {
      filter.$or = [
        { email: new RegExp(escapeRegex(search), 'i') },
        { name: new RegExp(escapeRegex(search), 'i') },
        { username: new RegExp(escapeRegex(search), 'i') },
      ];
    }

    const sortByJoinedField = sortBy === 'tokenCredits' || sortBy === 'conversationCount';

    const total = await User.countDocuments(filter);
    let users;

    if (sortByJoinedField) {
      users = await User.find(filter, 'email name username role createdAt')
        .sort({ createdAt: -1 })
        .limit(MAX_USERS_FOR_JOIN_SORT)
        .lean();
    } else {
      const sortObj = { [sortBy]: sortDirection };
      users = await User.find(filter, 'email name username role createdAt')
        .sort(sortObj)
        .skip(skip)
        .limit(pageSize)
        .lean();
    }

    const userObjectIds = users.map((u) => u._id);
    const userStringIds = users.map((u) => u._id.toString());
    const pageBans = sortByJoinedField ? null : getBannedUserIds(userStringIds);
    const [balances, conversationCounts] = await Promise.all([
      Balance.find({ user: { $in: userObjectIds } })
        .select('user tokenCredits bonusResets')
        .lean(),
      Conversation.aggregate([
        { $match: { user: { $in: userStringIds } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
    ]);

    const balanceByUser = new Map(balances.map((b) => [b.user.toString(), b]));
    const convoCountByUser = new Map(conversationCounts.map((c) => [c._id.toString(), c.count]));

    let items = users.map((u) => {
      const balance = balanceByUser.get(u._id.toString());
      return {
        _id: u._id.toString(),
        email: u.email,
        name: u.name,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt,
        tokenCredits: balance?.tokenCredits ?? 0,
        bonusResets: balance?.bonusResets ?? 0,
        conversationCount: convoCountByUser.get(u._id.toString()) ?? 0,
      };
    });

    if (sortByJoinedField) {
      const mult = sortDirection === 1 ? 1 : -1;
      items.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return mult * (aVal - bVal);
        }
        const aStr = String(aVal ?? '');
        const bStr = String(bVal ?? '');
        return mult * aStr.localeCompare(bStr);
      });
      items = items.slice(skip, skip + pageSize);
    }

    const bannedIds = await (pageBans ?? getBannedUserIds(items.map((item) => item._id)));

    res.status(200).json({
      users: items.map((item) => ({ ...item, isBanned: bannedIds.has(item._id) })),
      total,
      page,
      pageSize,
    });
  } catch {
    res.status(500).json({ error: 'Failed to list users' });
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mirrors `checkBan`: an entry without `expiresAt` is banned until removed. */
function isActiveBan(entry, now) {
  if (!entry) {
    return false;
  }
  const expiresAt = Number(entry.expiresAt);
  return !entry.expiresAt || isNaN(expiresAt) || expiresAt > now;
}

async function getBannedUserIds(userIds) {
  if (userIds.length === 0) {
    return new Set();
  }
  try {
    const entries = await getLogStores(ViolationTypes.BAN).getMany(userIds);
    const now = Date.now();
    return new Set(userIds.filter((_, i) => isActiveBan(entries[i], now)));
  } catch (error) {
    logger.warn('[admin/users] Failed to read ban states:', error);
    return new Set();
  }
}

/** Rejects self-targeting and malformed ids; returns the target user or sends the error. */
async function resolveTargetUser(req, res, action) {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json({ error: 'Invalid user ID format' });
    return null;
  }
  const callerId = req.user?._id?.toString() ?? req.user?.id;
  if (callerId === userId) {
    res.status(403).json({ error: `Cannot ${action} your own account` });
    return null;
  }
  const user = await db.getUserById(userId, '_id email role tenantId');
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  return user;
}

async function setUserBalance(req, res) {
  try {
    const { userId } = req.params;
    const amount = parseInt(req.body?.amount, 10);
    if (amount == null || isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const balance = await Balance.findOneAndUpdate(
      { user: userId },
      { $set: { tokenCredits: amount } },
      { upsert: true, new: true },
    ).lean();

    res.status(200).json({ tokenCredits: balance.tokenCredits });
  } catch {
    res.status(500).json({ error: 'Failed to set balance' });
  }
}

async function setAllUsersBalance(req, res) {
  try {
    const amount = parseInt(req.body?.amount, 10);
    if (amount == null || isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const users = await User.find({}).select('_id').lean();
    let updatedCount = 0;
    for (const user of users) {
      await Balance.findOneAndUpdate(
        { user: user._id },
        { $set: { tokenCredits: amount } },
        { upsert: true, new: true },
      ).lean();
      updatedCount++;
    }

    res.status(200).json({ updatedCount, amount });
  } catch {
    res.status(500).json({ error: 'Failed to set balance for all users' });
  }
}

async function banUser(req, res) {
  try {
    const durationMinutes = parseInt(req.body?.durationMinutes, 10);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      return res.status(400).json({ error: 'Valid durationMinutes is required' });
    }
    if (!isEnabled(process.env.BAN_VIOLATIONS)) {
      return res
        .status(409)
        .json({ error: 'Bans are not enforced: set BAN_VIOLATIONS=true on the server' });
    }

    const user = await resolveTargetUser(req, res, 'ban');
    if (!user) {
      return;
    }

    const userId = user._id.toString();
    const duration = Math.min(durationMinutes, MAX_BAN_MINUTES) * 60 * 1000;
    const expiresAt = Date.now() + duration;

    await getLogStores(ViolationTypes.BAN).set(
      userId,
      { type: ViolationTypes.BAN, violation_count: 0, duration, expiresAt },
      duration,
    );
    await db.deleteAllUserSessions({ userId });
    logger.info(`[admin/users] ${req.user?.email} banned user ${user.email} until ${expiresAt}`);

    res.status(200).json({ banned: true, expiresAt });
  } catch (error) {
    logger.error('[admin/users] banUser error:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
}

async function unbanUser(req, res) {
  try {
    const { userId } = req.params;
    await Promise.all([getLogStores(ViolationTypes.BAN).delete(userId), clearUserBanCache(userId)]);
    res.status(200).json({ banned: false });
  } catch (error) {
    logger.error('[admin/users] unbanUser error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
}

async function deleteUser(req, res) {
  try {
    const target = await resolveTargetUser(req, res, 'delete');
    if (!target) {
      return;
    }

    if (target.role === SystemRoles.ADMIN) {
      const adminCount = await User.countDocuments({ role: SystemRoles.ADMIN });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user' });
      }
    }

    const userId = target._id.toString();
    const user = { ...target, id: userId };
    const config = await getAppConfig(getAppConfigOptionsFromUser(user));
    await deleteUserAccount({ user, config, body: {} });

    await Promise.allSettled([
      getLogStores(ViolationTypes.BAN).delete(userId),
      clearUserBanCache(userId),
      invalidateCachedAuthUserDoc(getLogStores(CacheKeys.AUTH_USER_DOC), { userId }),
    ]);
    logger.info(`[admin/users] ${req.user?.email} deleted user ${target.email} (${userId})`);

    res.status(200).json({ deleted: true });
  } catch (error) {
    logger.error('[admin/users] deleteUser error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

async function addUserBalance(req, res) {
  try {
    const { userId } = req.params;
    const amount = parseInt(req.body?.amount, 10);
    if (amount == null || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }

    const balance = await Balance.findOneAndUpdate(
      { user: userId },
      { $inc: { tokenCredits: amount } },
      { upsert: true, new: true },
    ).lean();

    await Transaction.create({
      user: userId,
      tokenType: 'credits',
      context: 'admin',
      rawAmount: amount,
      tokenValue: amount,
    });

    res.status(200).json({ tokenCredits: balance.tokenCredits });
  } catch {
    res.status(500).json({ error: 'Failed to add balance' });
  }
}

async function getUserConversations(req, res) {
  try {
    const { userId } = req.params;
    const requestedLimit = parseInt(req.query.limit, 10) || DEFAULT_CONVERSATION_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_CONVERSATION_LIMIT);
    const sortBy = CONVERSATION_SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'updatedAt';
    const sortOrder = req.query.sortDirection === 'asc' ? 1 : -1;
    const filters = [
      { user: userId },
      { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] },
      { $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }] },
    ];

    const cursorFilter = parseConversationCursor(req.query.cursor, sortBy, sortOrder);
    if (cursorFilter) {
      filters.push(cursorFilter);
    }

    const sort = { [sortBy]: sortOrder };
    if (sortBy !== 'updatedAt') {
      sort.updatedAt = sortOrder;
    }

    const conversations = await Conversation.find({ $and: filters })
      .select(CONVERSATION_SELECT_FIELDS)
      .sort(sort)
      .limit(limit + 1)
      .lean();

    const hasNextPage = conversations.length > limit;
    if (hasNextPage) {
      conversations.pop();
    }

    res.status(200).json({
      conversations,
      nextCursor: hasNextPage ? createConversationCursor(conversations.at(-1), sortBy) : null,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
}

function parseConversationCursor(cursor, sortBy, sortOrder) {
  if (!cursor || typeof cursor !== 'string') {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
    const { primary, secondary } = decoded;
    const primaryValue = sortBy === 'title' ? primary : new Date(primary);
    const secondaryValue = new Date(secondary);
    const op = sortOrder === 1 ? '$gt' : '$lt';

    return {
      $or: [
        { [sortBy]: { [op]: primaryValue } },
        {
          [sortBy]: primaryValue,
          updatedAt: { [op]: secondaryValue },
        },
      ],
    };
  } catch {
    return null;
  }
}

function createConversationCursor(conversation, sortBy) {
  if (!conversation) {
    return null;
  }

  let primary = conversation.updatedAt;
  if (sortBy === 'title') {
    primary = conversation.title;
  } else if (sortBy === 'createdAt') {
    primary = conversation.createdAt;
  }

  const cursor = {
    primary: sortBy === 'title' ? primary : new Date(primary ?? 0).toISOString(),
    secondary: new Date(conversation.updatedAt ?? 0).toISOString(),
  };

  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

async function getConversationMessages(req, res) {
  try {
    const { userId, conversationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const messages = await Message.find({ user: userId, conversationId })
      .select(
        'messageId conversationId sender text content summary createdAt isCreatedByUser model endpoint',
      )
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    res
      .status(200)
      .json({ messages, nextCursor: messages.length === limit ? String(limit) : null });
  } catch {
    res.status(500).json({ error: 'Failed to load messages' });
  }
}

async function getUserTransactions(req, res) {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const now = new Date();
    const since = getTransactionsSince(now);
    const userMatch = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    const usageProjection = {
      tokenType: 1,
      model: 1,
      amount: { $ifNull: ['$tokenValue', { $ifNull: ['$rawAmount', 0] }] },
      rawAmount: { $ifNull: ['$rawAmount', 0] },
    };
    const usageGroupFields = {
      usageCredits: {
        $sum: {
          $cond: [{ $lt: ['$amount', 0] }, { $multiply: ['$amount', -1] }, 0],
        },
      },
      inputCredits: {
        $sum: {
          $cond: [
            { $and: [{ $eq: ['$tokenType', 'prompt'] }, { $lt: ['$amount', 0] }] },
            { $multiply: ['$amount', -1] },
            0,
          ],
        },
      },
      outputCredits: {
        $sum: {
          $cond: [
            { $and: [{ $eq: ['$tokenType', 'completion'] }, { $lt: ['$amount', 0] }] },
            { $multiply: ['$amount', -1] },
            0,
          ],
        },
      },
      inputTokens: {
        $sum: {
          $cond: [{ $eq: ['$tokenType', 'prompt'] }, { $abs: '$rawAmount' }, 0],
        },
      },
      outputTokens: {
        $sum: {
          $cond: [{ $eq: ['$tokenType', 'completion'] }, { $abs: '$rawAmount' }, 0],
        },
      },
      addedCredits: {
        $sum: {
          $cond: [{ $gt: ['$amount', 0] }, '$amount', 0],
        },
      },
      netCredits: { $sum: '$amount' },
      transactionCount: { $sum: 1 },
    };

    const transactionMatch = {
      user: userMatch,
      createdAt: { $gte: since },
    };

    const [transactions, summaries, modelSummaries] = await Promise.all([
      Transaction.find({
        user: userId,
        createdAt: { $gte: since },
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select(
          'context tokenType rawAmount tokenValue inputTokens writeTokens readTokens rate model createdAt',
        )
        .lean(),
      Transaction.aggregate([
        { $match: transactionMatch },
        { $project: usageProjection },
        { $group: { _id: null, ...usageGroupFields } },
      ]),
      Transaction.aggregate([
        { $match: transactionMatch },
        { $project: usageProjection },
        { $match: { amount: { $lt: 0 }, tokenType: { $in: ['prompt', 'completion'] } } },
        { $group: { _id: '$model', ...usageGroupFields } },
        { $sort: { usageCredits: -1 } },
      ]),
    ]);

    const mapped = transactions.map((tx) => ({
      _id: tx._id.toString(),
      context: tx.context,
      tokenType: tx.tokenType,
      rawAmount: tx.rawAmount,
      tokenValue: tx.tokenValue,
      inputTokens: tx.inputTokens,
      writeTokens: tx.writeTokens,
      readTokens: tx.readTokens,
      rate: tx.rate,
      model: tx.model,
      createdAt: tx.createdAt,
    }));
    const summary = summaries[0] ?? {};
    const usageCredits = summary.usageCredits ?? 0;
    const inputCredits = summary.inputCredits ?? 0;
    const outputCredits = summary.outputCredits ?? 0;

    res.status(200).json({
      transactions: mapped,
      summary: {
        usageCredits,
        usageUsd: usageCredits * USD_PER_CREDIT,
        inputCredits,
        inputUsd: inputCredits * USD_PER_CREDIT,
        inputTokens: summary.inputTokens ?? 0,
        outputCredits,
        outputUsd: outputCredits * USD_PER_CREDIT,
        outputTokens: summary.outputTokens ?? 0,
        addedCredits: summary.addedCredits ?? 0,
        netCredits: summary.netCredits ?? 0,
        transactionCount: summary.transactionCount ?? 0,
        modelBreakdown: modelSummaries.map((item) => ({
          model: item._id ?? null,
          usageCredits: item.usageCredits ?? 0,
          usageUsd: (item.usageCredits ?? 0) * USD_PER_CREDIT,
          inputCredits: item.inputCredits ?? 0,
          inputUsd: (item.inputCredits ?? 0) * USD_PER_CREDIT,
          inputTokens: item.inputTokens ?? 0,
          outputCredits: item.outputCredits ?? 0,
          outputUsd: (item.outputCredits ?? 0) * USD_PER_CREDIT,
          outputTokens: item.outputTokens ?? 0,
          transactionCount: item.transactionCount ?? 0,
        })),
        periodDays: TRANSACTIONS_DAYS,
        usdPerCredit: USD_PER_CREDIT,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to load transactions' });
  }
}

module.exports = {
  getStats,
  listUsers,
  setUserBalance,
  setAllUsersBalance,
  addUserBalance,
  banUser,
  unbanUser,
  deleteUser,
  getUserConversations,
  getConversationMessages,
  getUserTransactions,
};
