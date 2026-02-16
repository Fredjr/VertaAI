#!/bin/bash

# Test Track A (Agent PR Gatekeeper)
# This sends a webhook for an OPENED PR (not merged)
# Track A creates a GitHub Check Run on the PR

# Use the TEST webhook endpoint (no signature required)
# After Railway deploys the fix, this will call the real handler internally
curl -X POST "https://vertaai-api-production.up.railway.app/test/webhooks/github/demo-workspace" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{
    "action": "opened",
    "number": 3,
    "pull_request": {
      "number": 3,
      "title": "Add new API endpoint for user management",
      "body": "This PR adds a new DELETE endpoint for users",
      "user": {"login": "augment-bot"},
      "labels": [],
      "base": {
        "ref": "main",
        "repo": {
          "name": "vertaai-e2e-test",
          "full_name": "Fredjr/vertaai-e2e-test",
          "owner": {"login": "Fredjr"}
        }
      },
      "head": {
        "ref": "feature/delete-user-endpoint",
        "sha": "abc123def456"
      },
      "merged": false,
      "merged_at": null,
      "changed_files": 2,
      "additions": 50,
      "deletions": 5,
      "commits": 3
    },
    "repository": {
      "name": "vertaai-e2e-test",
      "full_name": "Fredjr/vertaai-e2e-test",
      "owner": {"login": "Fredjr"}
    },
    "installation": {
      "id": 105899665
    }
  }'

