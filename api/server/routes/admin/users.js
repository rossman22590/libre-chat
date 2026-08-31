const express = require('express');
const { createAdminUsersHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const adminUsersController = require('~/server/controllers/admin/users');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const {
  drainAgentTriggerDeliveriesForUser,
  prepareAgentTriggerUserPurge,
  cancelAgentTriggerUserPurge,
  purgeAgentTriggerDeliveriesForUser,
} = require('~/server/services/Agents/triggers');
const db = require('~/models');
const { invalidateCodeEnvironmentConfigCache } = require('~/server/services/Config');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsers = requireCapability(SystemCapabilities.READ_USERS);
const requireManageUsers = requireCapability(SystemCapabilities.MANAGE_USERS);

const handlers = createAdminUsersHandlers({
  findUsers: db.findUsers,
  countUsers: db.countUsers,
  beginAgentTriggerUserDeletion: db.beginAgentTriggerUserDeletion,
  cancelAgentTriggerUserDeletion: db.cancelAgentTriggerUserDeletion,
  drainAgentTriggerDeliveriesForUser,
  prepareAgentTriggerUserPurge,
  cancelAgentTriggerUserPurge,
  purgeAgentTriggerDeliveriesForUser,
  deleteUserById: db.deleteUserById,
  deleteUserCodeEnvironments: db.deleteUserCodeEnvironments,
  invalidateCodeEnvironmentConfigCache,
  deleteConfig: db.deleteConfig,
  deleteAclEntries: db.deleteAclEntries,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/stats', requireReadUsers, adminUsersController.getStats);
router.get('/', requireReadUsers, adminUsersController.listUsers);
router.get('/search', requireReadUsers, handlers.searchUsers);
router.post('/balance/set-all', requireManageUsers, adminUsersController.setAllUsersBalance);
router.put('/:userId/balance', requireManageUsers, adminUsersController.setUserBalance);
router.post('/:userId/balance/add', requireManageUsers, adminUsersController.addUserBalance);
router.post('/:userId/ban', requireManageUsers, adminUsersController.banUser);
router.delete('/:userId/ban', requireManageUsers, adminUsersController.unbanUser);
router.get('/:userId/conversations', requireReadUsers, adminUsersController.getUserConversations);
router.get(
  '/:userId/conversations/:conversationId/messages',
  requireReadUsers,
  adminUsersController.getConversationMessages,
);
router.get('/:userId/transactions', requireReadUsers, adminUsersController.getUserTransactions);

module.exports = router;
