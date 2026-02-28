/**
 * Test Scenario: Breaking API Change
 * 
 * This file simulates a breaking change to the users API endpoint.
 * It should trigger multiple governance rules.
 */

import { Router } from 'express';

const router = Router();

/**
 * Get user by ID
 * 
 * BREAKING CHANGE: Response format changed
 * - Removed: email field (direct access)
 * - Added: contactInfo nested object
 * - Changed: Authentication from API key to OAuth2
 * 
 * OLD RESPONSE:
 * {
 *   id: string;
 *   name: string;
 *   email: string;  // REMOVED
 *   createdAt: string;
 * }
 * 
 * NEW RESPONSE:
 * {
 *   id: string;
 *   name: string;
 *   contactInfo: {     // NEW
 *     email: string;
 *     phone?: string;
 *   };
 *   createdAt: string;
 * }
 */
router.get('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  
  // NEW: OAuth2 authentication required
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'OAuth2 token required' });
  }
  
  // Simulate database query
  const user = {
    id,
    name: 'Test User',
    contactInfo: {
      email: 'test@example.com',
      phone: '+1234567890',
    },
    createdAt: new Date().toISOString(),
  };
  
  return res.json(user);
});

/**
 * Update user
 * 
 * BREAKING CHANGE: Request body format changed
 * - Now requires contactInfo object instead of direct email field
 */
router.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, contactInfo } = req.body;
  
  // NEW: OAuth2 authentication required
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'OAuth2 token required' });
  }
  
  // Validate contactInfo
  if (!contactInfo || !contactInfo.email) {
    return res.status(400).json({ error: 'contactInfo.email is required' });
  }
  
  // Simulate database update
  const updatedUser = {
    id,
    name,
    contactInfo,
    updatedAt: new Date().toISOString(),
  };
  
  return res.json(updatedUser);
});

export default router;

