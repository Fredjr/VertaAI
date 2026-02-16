#!/bin/bash

# Test Track A for PR #2 (real PR in vertaai-e2e-test)
# This sends a webhook for the actual PR we just created

curl -X POST "https://vertaai-api-production.up.railway.app/test/webhooks/github/demo-workspace" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{
    "action": "opened",
    "number": 2,
    "pull_request": {
      "number": 2,
      "title": "Add Payment API with refund support",
      "body": "This PR adds a new Payment API module that supports:\n\n- Processing payments via external payment gateway\n- Full and partial refunds\n- Secure API key authentication\n\n## Changes\n- Added `src/payment.js` with `PaymentAPI` class\n- Implemented `processPayment()` method\n- Implemented `refundPayment()` method\n\n## API Endpoints Used\n- `POST /payments` - Process a payment\n- `POST /refunds` - Refund a payment\n\n⚠️ **Note**: This is a new public API that external clients will use.",
      "user": {"login": "Fredjr"},
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
        "ref": "feature/add-payment-api",
        "sha": "ee01061943b9af95317545a930889bbbedba10aa"
      },
      "merged": false,
      "merged_at": null,
      "changed_files": 1,
      "additions": 56,
      "deletions": 0,
      "commits": 1
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

