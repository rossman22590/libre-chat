const { Balance, Transaction } = require('~/db/models');

const TRANSACTIONS_LIMIT = 50;

async function balanceController(req, res) {
  const balanceData = await Balance.findOne(
    { user: req.user.id },
    '-_id tokenCredits autoRefillEnabled refillIntervalValue refillIntervalUnit lastRefill refillAmount',
  ).lean();

  if (!balanceData) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  // If auto-refill is not enabled, remove auto-refill related fields from the response
  if (!balanceData.autoRefillEnabled) {
    delete balanceData.refillIntervalValue;
    delete balanceData.refillIntervalUnit;
    delete balanceData.lastRefill;
    delete balanceData.refillAmount;
  }

  res.status(200).json(balanceData);
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
