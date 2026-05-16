const express = require('express');
const { createSetBalanceConfig } = require('@librechat/api');
const router = express.Router();
const balanceController = require('../controllers/Balance');
const { requireJwtAuth } = require('../middleware/');
const { getAppConfig } = require('~/server/services/Config');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

router.get('/', requireJwtAuth, setBalanceConfig, balanceController);
router.get(
  '/transactions',
  requireJwtAuth,
  balanceController.balanceTransactionsController,
);

module.exports = router;
