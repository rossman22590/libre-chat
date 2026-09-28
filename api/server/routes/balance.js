const express = require('express');
const { createSetBalanceConfig, createUsageResetHandler } = require('@librechat/api');
const router = express.Router();
const balanceController = require('../controllers/Balance');
const { requireJwtAuth } = require('../middleware/');
const { findBalanceByUser, upsertBalanceFields, claimUsageReset } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

router.get('/', requireJwtAuth, setBalanceConfig, balanceController);
router.post(
  '/reset',
  requireJwtAuth,
  setBalanceConfig,
  createUsageResetHandler({ claimUsageReset }),
);
router.get('/transactions', requireJwtAuth, balanceController.balanceTransactionsController);

module.exports = router;
