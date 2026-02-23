# GitHub OAuth Security - No Credentials Stored

## ✅ Secure GitHub App Integration Flow

VertaAI uses **GitHub App installation** (not OAuth tokens) to access customer repositories. This is the most secure method recommended by GitHub.

### How It Works (No Credentials Stored)

1. **User Clicks "Connect GitHub"**
   - Button appears in the policy pack creation UI
   - Redirects to: `{API_URL}/auth/github/install?workspaceId={workspaceId}`

2. **API Redirects to GitHub**
   - API generates a secure state token (CSRF protection)
   - Redirects user to: `https://github.com/apps/vertaai/installations/new`
   - User sees GitHub's official authorization page

3. **User Authorizes on GitHub.com**
   - User selects which repositories to grant access to
   - User clicks "Install" or "Install & Authorize"
   - **VertaAI never sees or stores the user's GitHub password or personal access token**

4. **GitHub Redirects Back with Installation ID**
   - GitHub redirects to: `{API_URL}/auth/github/callback?installation_id=12345&state=...`
   - Callback receives only the `installation_id` (a number like `12345`)

5. **VertaAI Stores Only the Installation ID**
   - Stored in database: `Integration.config.installationId`
   - **No passwords, no tokens, no credentials stored**

6. **API Calls Use Installation Access Tokens**
   - When VertaAI needs to access GitHub, it:
     - Uses the GitHub App's private key (stored in environment variables, not database)
     - Exchanges it for a temporary installation access token (expires in 1 hour)
     - Uses the token to make API calls
   - Tokens are cached for performance but expire automatically

---

## 🔒 Security Benefits

### 1. No Customer Credentials Stored
- ✅ VertaAI never sees the user's GitHub password
- ✅ VertaAI never stores Personal Access Tokens (PATs)
- ✅ Only the `installation_id` is stored (a non-sensitive number)

### 2. Fine-Grained Permissions
- ✅ User controls which repositories VertaAI can access
- ✅ User can revoke access anytime from GitHub settings
- ✅ Permissions are scoped to specific actions (read repos, read PRs, write checks)

### 3. Automatic Token Expiration
- ✅ Installation access tokens expire after 1 hour
- ✅ VertaAI must re-authenticate for each session
- ✅ Compromised tokens have limited lifetime

### 4. Audit Trail
- ✅ All API calls appear in GitHub's audit log
- ✅ User can see when VertaAI accessed their repos
- ✅ User can see which repos were accessed

### 5. Easy Revocation
- ✅ User can uninstall the GitHub App anytime
- ✅ Revocation is instant - VertaAI loses access immediately
- ✅ No need to rotate tokens or change passwords

---

## 📊 What's Stored in the Database

```typescript
// Integration table (apps/api/prisma/schema.prisma)
model Integration {
  id            BigInt
  workspaceId   String
  type          String   // "github"
  status        String   // "connected"
  config        Json     // See below
  webhookSecret String?  // For webhook signature verification
  createdAt     DateTime
  updatedAt     DateTime
}
```

**Config JSON (what's actually stored):**
```json
{
  "installationId": 12345,           // ✅ Non-sensitive number
  "appId": "67890",                  // ✅ Public GitHub App ID
  "setupAction": "install",          // ✅ Metadata
  "repos": ["owner/repo1", "..."],   // ✅ Public repo names
  "installedAt": "2024-01-01T00:00:00Z"  // ✅ Timestamp
}
```

**What's NOT stored:**
- ❌ User's GitHub password
- ❌ Personal Access Tokens (PATs)
- ❌ OAuth access tokens
- ❌ GitHub App private key (stored in environment variables only)

---

## 🔑 Environment Variables (Server-Side Only)

These are stored in Railway/Vercel environment variables, **never in the database**:

```bash
GH_APP_ID=67890                    # Public GitHub App ID
GH_APP_PRIVATE_KEY="-----BEGIN..." # Private key for signing JWTs
GITHUB_APP_NAME=vertaai            # App name for installation URL
```

The private key is used to:
1. Generate a JWT (JSON Web Token)
2. Exchange the JWT + installation_id for a temporary access token
3. Use the access token to make API calls

**Security**: The private key never leaves the server and is never sent to the client.

---

## 🌐 User Experience Flow

### Step 1: User Sees "GitHub Not Connected" Warning
```
┌─────────────────────────────────────────────────────┐
│ ⚠️  GitHub Not Connected                            │
│                                                     │
│ Connect your GitHub account to automatically       │
│ fetch repositories and branches.                   │
│                                                     │
│                          [Connect GitHub] ←─ Button│
└─────────────────────────────────────────────────────┘
```

### Step 2: User Clicks "Connect GitHub"
- Redirects to GitHub.com (official GitHub authorization page)
- User sees: "VertaAI by [Your Org] wants to access your repositories"

### Step 3: User Selects Repositories
- User can choose "All repositories" or "Only select repositories"
- User selects which repos to grant access to

### Step 4: User Clicks "Install"
- GitHub installs the app and redirects back to VertaAI
- User sees: "✅ GitHub Connected - 12 repositories available"

### Step 5: User Can Revoke Anytime
- Go to: https://github.com/settings/installations
- Click "Configure" next to VertaAI
- Click "Uninstall" to revoke access

---

## 🛡️ Compliance & Best Practices

### ✅ Follows GitHub's Recommendations
- Uses GitHub Apps (not OAuth Apps or PATs)
- Implements CSRF protection with state parameter
- Uses installation access tokens (not user tokens)
- Respects user's repository selection

### ✅ GDPR Compliant
- No personal data stored (only installation_id)
- User can revoke access anytime
- Clear audit trail of data access

### ✅ SOC 2 Ready
- Credentials stored in secure environment variables
- Access tokens expire automatically
- All API calls are logged

---

## 📝 Code References

- **OAuth Flow**: `apps/api/src/routes/github-oauth.ts`
- **GitHub Client**: `apps/api/src/services/github-client.ts`
- **UI Button**: `apps/web/src/app/policy-packs/new/sections/ScopeForm.tsx`
- **Integration Model**: `apps/api/prisma/schema.prisma`

---

## ❓ FAQ

**Q: Does VertaAI store my GitHub password?**  
A: No. VertaAI never sees or stores your GitHub password. You authorize the app on GitHub.com.

**Q: Can VertaAI access all my repositories?**  
A: No. You choose which repositories to grant access to during installation.

**Q: How do I revoke access?**  
A: Go to https://github.com/settings/installations and uninstall the VertaAI app.

**Q: What happens if VertaAI's database is compromised?**  
A: The attacker would only get the `installation_id` (a number). They cannot use it without the GitHub App's private key, which is stored separately in environment variables.

**Q: How long do access tokens last?**  
A: Installation access tokens expire after 1 hour. VertaAI must re-authenticate for each session.

