const express = require('express');
const middleware = require('~/server/middleware');
const adminUsersController = require('~/server/controllers/admin/users');

const router = express.Router();

router.get('/stats', middleware.requireJwtAuth, middleware.checkAdmin, adminUsersController.getStats);
router.get('/users', middleware.requireJwtAuth, middleware.checkAdmin, adminUsersController.listUsers);
router.post(
  '/users/balance/set-all',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.setAllUsersBalance,
);
router.put(
  '/users/:userId/balance',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.setUserBalance,
);
router.post(
  '/users/:userId/balance/add',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.addUserBalance,
);
router.post(
  '/users/:userId/ban',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.banUser,
);
router.delete(
  '/users/:userId/ban',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.unbanUser,
);
router.get(
  '/users/:userId/conversations',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.getUserConversations,
);
router.get(
  '/users/:userId/conversations/:conversationId/messages',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.getConversationMessages,
);
router.get(
  '/users/:userId/transactions',
  middleware.requireJwtAuth,
  middleware.checkAdmin,
  adminUsersController.getUserTransactions,
);

module.exports = router;
