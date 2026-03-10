const path = require('path');
const mongoose = require('mongoose');
const { getBalanceConfig } = require('@librechat/api');
const { User, Balance } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Set balance for ALL users!');
  console.purple('--------------------------');

  const balanceConfig = getBalanceConfig();
  if (!balanceConfig?.enabled) {
    console.red('Error: Balance is not enabled. Use librechat.yaml to enable it');
    silentExit(1);
  }

  const amountArg = process.argv[2];
  const amount = amountArg ? parseInt(amountArg, 10) : (balanceConfig.startBalance ?? 600000);

  if (isNaN(amount) || amount < 0) {
    console.red('Error: Invalid amount. Provide a positive integer, e.g.: npm run set-balance-all 600000');
    silentExit(1);
  }

  console.purple(`Amount: ${amount.toLocaleString()}`);
  console.purple(`Auto-refill: every ${balanceConfig.refillIntervalValue} ${balanceConfig.refillIntervalUnit} (${(balanceConfig.refillAmount ?? amount).toLocaleString()} credits)`);

  const users = await User.find({}).select('_id email').lean();
  if (!users.length) {
    console.orange('No users found in the database.');
    silentExit(0);
  }

  console.purple(`Found ${users.length} user(s). Updating...`);

  const now = new Date();
  const updateFields = {
    tokenCredits: amount,
    lastRefill: now,
    ...(balanceConfig.autoRefillEnabled != null && { autoRefillEnabled: balanceConfig.autoRefillEnabled }),
    ...(balanceConfig.refillIntervalValue != null && { refillIntervalValue: balanceConfig.refillIntervalValue }),
    ...(balanceConfig.refillIntervalUnit != null && { refillIntervalUnit: balanceConfig.refillIntervalUnit }),
    ...(balanceConfig.refillAmount != null && { refillAmount: balanceConfig.refillAmount }),
  };

  let updatedCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      await Balance.findOneAndUpdate(
        { user: user._id },
        { $set: updateFields },
        { upsert: true, new: true },
      ).lean();
      updatedCount++;
    } catch (error) {
      console.red(`Error updating ${user.email}: ${error.message}`);
      errorCount++;
    }
  }

  if (errorCount > 0) {
    console.orange(`Finished with ${errorCount} error(s).`);
  }

  console.green(`Done! ${updatedCount} user(s) set to ${amount.toLocaleString()} credits.`);
  console.green(`6-hour refill timer reset to now (${now.toISOString()}).`);
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    return;
  } else {
    process.exit(1);
  }
});
