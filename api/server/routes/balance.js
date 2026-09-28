const express = require('express');
const {
  createUsageHandlers,
  createSetBalanceConfig,
  createUsageResetHandler,
} = require('@librechat/api');
const router = express.Router();
const balanceController = require('../controllers/Balance');
const { requireJwtAuth } = require('../middleware/');
const {
  claimUsageReset,
  getUsageSummary,
  getUsageActivity,
  findBalanceByUser,
  upsertBalanceFields,
} = require('~/models');
const { getAppConfig } = require('~/server/services/Config');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});
const usage = createUsageHandlers({ getUsageSummary, getUsageActivity });

router.get('/', requireJwtAuth, setBalanceConfig, balanceController);
router.post(
  '/reset',
  requireJwtAuth,
  setBalanceConfig,
  createUsageResetHandler({ claimUsageReset }),
);
router.get('/usage', requireJwtAuth, usage.summary);
router.get('/activity', requireJwtAuth, usage.activity);
router.get('/transactions', requireJwtAuth, balanceController.balanceTransactionsController);

module.exports = router;
