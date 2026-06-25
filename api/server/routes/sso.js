const express = require('express');
const jwt = require('jsonwebtoken');
const { setAuthTokens } = require('~/server/services/AuthService');
const { findUser } = require('~/models');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

router.get('/sso', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    logger.warn('[SSO] SSO request missing token');
    return res.status(400).json({ message: 'Token is required' });
  }

  // Use JWT secret configured for the LibreChat instance
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('[SSO] JWT_SECRET is not configured on server');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (!decoded.email) {
      logger.warn('[SSO] Token payload missing email');
      return res.status(400).json({ message: 'Invalid token payload' });
    }

    const email = decoded.email.trim().toLowerCase();
    const dbUser = await findUser({ email });
    if (!dbUser) {
      logger.warn(`[SSO] User ${email} not found in database`);
      return res.status(404).json({ message: 'User not found' });
    }

    // Set cookies & auth tokens in response
    await setAuthTokens(dbUser._id, res, null, req);

    logger.info(`[SSO] User ${email} successfully logged in via SSO`);

    // Redirect to home/chat page
    const clientUrl = process.env.DOMAIN_CLIENT || '/';
    return res.redirect(clientUrl);
  } catch (err) {
    logger.error('[SSO] Verification failed:', err);
    return res.status(401).json({ message: 'Invalid or expired SSO token' });
  }
});

module.exports = router;
