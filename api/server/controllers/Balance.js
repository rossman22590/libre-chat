const { findBalanceByUser } = require('~/models');
const { Transaction } = require('~/db/models');

const TRANSACTIONS_LIMIT = 50;

async function balanceController(req, res) {
  const balanceData = await findBalanceByUser(req.user.id);

  if (!balanceData) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  const { _id: _, ...result } = balanceData;

  if (!result.autoRefillEnabled) {
    delete result.refillIntervalValue;
    delete result.refillIntervalUnit;
    delete result.lastRefill;
    delete result.refillAmount;
  }

  res.status(200).json(result);
}

async function balanceTransactionsController(req, res) {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit, 10) || TRANSACTIONS_LIMIT, 100);

  let transactions;
  try {
    transactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('context tokenType rawAmount tokenValue model createdAt')
      .lean();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load transactions' });
  }

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
}

module.exports = balanceController;
module.exports.balanceTransactionsController = balanceTransactionsController;
