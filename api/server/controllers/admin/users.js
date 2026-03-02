const { User, Balance } = require('~/db/models');
const getLogStores = require('~/cache/getLogStores');
const { ViolationTypes } = require('librechat-data-provider');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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
    const balances = await Balance.find({ user: { $in: userObjectIds } })
      .select('user tokenCredits')
      .lean();

    const balanceByUser = new Map(
      balances.map((b) => [b.user.toString(), b.tokenCredits ?? 0]),
    );

    const items = users.map((u) => ({
      _id: u._id.toString(),
      email: u.email,
      name: u.name,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      tokenCredits: balanceByUser.get(u._id.toString()) ?? 0,
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

module.exports = {
  listUsers,
  setUserBalance,
  banUser,
  unbanUser,
};
