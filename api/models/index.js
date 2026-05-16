const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const { matchModelName, findMatchingPattern } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const methods = createMethods(mongoose, {
  matchModelName,
  findMatchingPattern,
  getCache: getLogStores,
});

const findBalanceByUser =
  methods.findBalanceByUser ??
  ((user) => {
    const Balance = mongoose.models.Balance;
    return Balance.findOne({ user }).lean();
  });

const upsertBalanceFields =
  methods.upsertBalanceFields ??
  ((user, fields) => {
    const Balance = mongoose.models.Balance;
    return Balance.findOneAndUpdate({ user }, { $set: fields }, { upsert: true, new: true }).lean();
  });

const deleteBalances =
  methods.deleteBalances ??
  ((filter) => {
    const Balance = mongoose.models.Balance;
    return Balance.deleteMany(filter);
  });

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
  await methods.seedSystemGrants();
};

module.exports = {
  ...methods,
  findBalanceByUser,
  upsertBalanceFields,
  deleteBalances,
  seedDatabase,
};
