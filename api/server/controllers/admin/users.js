const { User, Balance, Conversation, Message, Transaction } = require('~/db/models');
const getLogStores = require('~/cache/getLogStores');
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

const ALLOWED_SORT_FIELDS = ['email', 'name', 'role', 'createdAt', 'tokenCredits', 'conversationCount'];
const DEFAULT_SORT_FIELD = 'createdAt';
const DEFAULT_SORT_DIR = -1;
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
    const [balances, conversationCounts] = await Promise.all([
      Balance.find({ user: { $in: userObjectIds } })
        .select('user tokenCredits lastRefill refillIntervalValue refillIntervalUnit')
        .lean(),
      Conversation.aggregate([
        { $match: { user: { $in: userStringIds } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
    ]);

    const balanceByUser = new Map(
      balances.map((b) => [b.user.toString(), b.tokenCredits ?? 0]),
    );
    const lastRefillByUser = new Map(
      balances.map((b) => [b.user.toString(), b.lastRefill ?? null]),
    );
    const refillIntervalByUser = new Map(
      balances.map((b) => [
        b.user.toString(),
        {
          value: b.refillIntervalValue,
          unit: b.refillIntervalUnit,
        },
      ]),
    );
    const convoCountByUser = new Map(
      conversationCounts.map((c) => [c._id.toString(), c.count]),
    );

    let items = users.map((u) => {
      const id = u._id.toString();
      const interval = refillIntervalByUser.get(id);
      return {
        _id: id,
        email: u.email,
        name: u.name,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt,
        tokenCredits: balanceByUser.get(id) ?? 0,
        conversationCount: convoCountByUser.get(id) ?? 0,
        lastRefill: lastRefillByUser.get(id) ?? null,
        refillIntervalValue: interval?.value,
        refillIntervalUnit: interval?.unit,
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to set balance for all users' });
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
    const banLogs = getLogStores(ViolationTypes.BAN);
    const expiresAt = Date.now() + duration;

    await banLogs.set(userId, {
      type: ViolationTypes.BAN,
      violation_count: 0,
      duration,
      expiresAt,
    });

    res.status(200).json({ banned: true, expiresAt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ban user' });
  }
}

async function unbanUser(req, res) {
  try {
    const { userId } = req.params;
    const banLogs = getLogStores(ViolationTypes.BAN);
    await banLogs.delete(userId);
    res.status(200).json({ banned: false });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unban user' });
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
      .select('messageId conversationId sender text content createdAt isCreatedByUser model endpoint')
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
  setAllUsersBalance,
  addUserBalance,
  banUser,
  unbanUser,
  getUserConversations,
  getConversationMessages,
  getUserTransactions,
};
