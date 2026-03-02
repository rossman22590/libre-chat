const { User, Balance, Message, Transaction, Conversation } = require('~/db/models');
const getLogStores = require('~/cache/getLogStores');
const { logger } = require('@librechat/data-schemas');
const { ViolationTypes } = require('librechat-data-provider');
const { getConvosByCursor } = require('~/models/Conversation');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const TRANSACTIONS_DAYS = 40;

async function getStats(req, res) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, recentSignups] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    ]);

    res.status(200).json({ totalUsers, recentSignups });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
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

    const filter = {};
    if (search) {
      filter.$or = [
        { email: new RegExp(escapeRegex(search), 'i') },
        { name: new RegExp(escapeRegex(search), 'i') },
        { username: new RegExp(escapeRegex(search), 'i') },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter, 'email name username role createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      User.countDocuments(filter),
    ]);

    const userObjectIds = users.map((u) => u._id);
    const userIdsStr = userObjectIds.map((id) => id.toString());

    const [balances, conversationCounts, banChecks] = await Promise.all([
      Balance.find({ user: { $in: userObjectIds } }).select('user tokenCredits').lean(),
      Conversation.aggregate([
        { $match: { user: { $in: userObjectIds } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
      Promise.all(userIdsStr.map((id) => getLogStores(ViolationTypes.BAN).get(id))),
    ]);

    const balanceByUser = new Map(
      balances.map((b) => [b.user.toString(), b.tokenCredits ?? 0]),
    );
    const convoCountByUser = new Map(
      conversationCounts.map((c) => [c._id.toString(), c.count]),
    );

    const items = users.map((u, i) => ({
      _id: u._id.toString(),
      email: u.email,
      name: u.name,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      tokenCredits: balanceByUser.get(u._id.toString()) ?? 0,
      conversationCount: convoCountByUser.get(u._id.toString()) ?? 0,
      isBanned: !!banChecks[i],
    }));

    res.status(200).json({
      users: items,
      total,
      page,
      pageSize,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users' });
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to set balance' });
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to add balance' });
  }
}

async function banUser(req, res) {
  try {
    const { userId } = req.params;
    const durationMinutes = parseInt(req.body?.durationMinutes, 10);
    if (durationMinutes == null || isNaN(durationMinutes) || durationMinutes <= 0) {
      return res.status(400).json({ error: 'Valid durationMinutes is required' });
    }

    const duration = durationMinutes * 60 * 1000;
    const banKey = typeof userId === 'string' ? userId : String(userId);
    const banLogs = getLogStores(ViolationTypes.BAN);
    const expiresAt = Date.now() + duration;
    const banPayload = {
      type: ViolationTypes.BAN,
      violation_count: 0,
      duration,
      expiresAt,
    };

    await banLogs.set(banKey, banPayload);
    logger.info(`[Admin] Banned user ${banKey} for ${durationMinutes} minutes`);
    res.status(200).json({ banned: true, expiresAt });
  } catch (err) {
    logger.error('[Admin] banUser error:', err);
    const message = err?.message ? `Failed to ban user: ${err.message}` : 'Failed to ban user';
    res.status(500).json({ error: message });
  }
}

async function unbanUser(req, res) {
  try {
    const { userId } = req.params;
    const banKey = typeof userId === 'string' ? userId : String(userId);
    const banLogs = getLogStores(ViolationTypes.BAN);
    await banLogs.delete(banKey);
    logger.info(`[Admin] Unbanned user ${banKey}`);
    res.status(200).json({ banned: false });
  } catch (err) {
    logger.error('[Admin] unbanUser error:', err);
    const message = err?.message ? `Failed to unban user: ${err.message}` : 'Failed to unban user';
    res.status(500).json({ error: message });
  }
}

async function getUserConversations(req, res) {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const cursor = req.query.cursor || undefined;
    const sortBy = req.query.sortBy || 'updatedAt';
    const sortDirection = req.query.sortDirection || 'desc';

    const result = await getConvosByCursor(userId, {
      cursor,
      limit,
      sortBy,
      sortDirection,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
}

async function getConversationMessages(req, res) {
  try {
    const { userId, conversationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const messages = await Message.find({ user: userId, conversationId })
      .select('messageId conversationId sender text createdAt isCreatedByUser model endpoint')
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    res.status(200).json({ messages, nextCursor: messages.length === limit ? String(limit) : null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
}

async function getUserTransactions(req, res) {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const since = new Date();
    since.setDate(since.getDate() - TRANSACTIONS_DAYS);

    const transactions = await Transaction.find({
      user: userId,
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('context tokenType rawAmount tokenValue model createdAt')
      .lean();

    const mapped = transactions.map((tx) => ({
      _id: tx._id.toString(),
      context: tx.context,
      tokenType: tx.tokenType,
      rawAmount: tx.rawAmount,
      tokenValue: tx.tokenValue,
      model: tx.model,
      createdAt: tx.createdAt,
    }));

    res.status(200).json({ transactions: mapped });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load transactions' });
  }
}

module.exports = {
  getStats,
  listUsers,
  setUserBalance,
  addUserBalance,
  banUser,
  unbanUser,
  getUserConversations,
  getConversationMessages,
  getUserTransactions,
};
