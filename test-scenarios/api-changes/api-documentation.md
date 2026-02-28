# Users API Documentation

**Version:** 2.0.0  
**Last Updated:** 2026-02-28

---

## Overview

The Users API provides endpoints for managing user information.

**BREAKING CHANGES in v2.0.0:**
- Response format changed for `/api/users/:id`
- Authentication changed from API key to OAuth2
- Email field moved to `contactInfo` object

---

## Authentication

All endpoints now require OAuth2 authentication.

**Headers:**
```
Authorization: Bearer <access_token>
```

**VIOLATION: Missing OAuth2 setup guide**
- No instructions on how to obtain access token
- No link to OAuth2 provider documentation
- No example of token exchange flow

---

## Endpoints

### GET /api/users/:id

Retrieve user information by ID.

**Request:**
```http
GET /api/users/user_123
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (v2.0.0):**
```json
{
  "id": "user_123",
  "name": "John Doe",
  "contactInfo": {
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "createdAt": "2026-02-28T10:00:00Z"
}
```

**VIOLATION: Missing migration guide**
- No explanation of how to migrate from v1.0.0 to v2.0.0
- No code examples showing old vs new format
- No deprecation timeline

**VIOLATION: Missing backward compatibility info**
- No information about v1.0.0 endpoint availability
- No sunset date for old format
- No versioning strategy documented

---

### PUT /api/users/:id

Update user information.

**Request:**
```http
PUT /api/users/user_123
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "John Doe",
  "contactInfo": {
    "email": "john.new@example.com",
    "phone": "+1234567890"
  }
}
```

**Response:**
```json
{
  "id": "user_123",
  "name": "John Doe",
  "contactInfo": {
    "email": "john.new@example.com",
    "phone": "+1234567890"
  },
  "updatedAt": "2026-02-28T10:05:00Z"
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "OAuth2 token required"
}
```

### 400 Bad Request
```json
{
  "error": "contactInfo.email is required"
}
```

### 404 Not Found
```json
{
  "error": "User not found"
}
```

---

## VIOLATIONS SUMMARY

This documentation is **incomplete** and should trigger governance findings:

1. ❌ **Missing Migration Guide**
   - No v1 → v2 migration instructions
   - No code examples for migration
   - No timeline for deprecation

2. ❌ **Missing OAuth2 Setup Guide**
   - No token acquisition instructions
   - No provider configuration
   - No example flows

3. ❌ **Missing Backward Compatibility Info**
   - No v1 endpoint availability info
   - No sunset dates
   - No versioning strategy

4. ❌ **Missing Security Review Documentation**
   - No security implications of OAuth2 change
   - No threat model update
   - No security testing results

These violations should be detected by the governance system!

