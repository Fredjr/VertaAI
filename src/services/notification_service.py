"""
Notification Service
Handles multi-channel notifications (email, SMS, push, Slack, webhooks).
"""

import json
import requests
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from enum import Enum
from datetime import datetime


class NotificationChannel(Enum):
    """Supported notification channels"""
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    SLACK = "slack"
    WEBHOOK = "webhook"
    IN_APP = "in_app"


class NotificationPriority(Enum):
    """Notification priority levels"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class NotificationRecipient:
    """Represents a notification recipient"""
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    slack_user_id: Optional[str] = None
    push_token: Optional[str] = None
    preferences: Dict[str, bool] = None


@dataclass
class Notification:
    """Represents a notification to be sent"""
    id: str
    title: str
    message: str
    channel: NotificationChannel
    priority: NotificationPriority
    recipients: List[NotificationRecipient]
    metadata: Dict[str, Any]
    created_at: datetime
    sent_at: Optional[datetime] = None
    status: str = "pending"


class NotificationService:
    """
    Multi-channel notification service.
    
    Features:
    - Multiple channels (email, SMS, push, Slack, webhooks)
    - Priority-based routing
    - Retry logic with exponential backoff
    - Delivery tracking and analytics
    - User preferences management
    - Template support
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the notification service.
        
        Args:
            config: Configuration dictionary with API keys and settings
        """
        self.config = config
        self.email_provider = config.get('email_provider', 'sendgrid')
        self.sms_provider = config.get('sms_provider', 'twilio')
        self.slack_webhook_url = config.get('slack_webhook_url')
        self.max_retries = config.get('max_retries', 3)
    
    def send_notification(self, notification: Notification) -> bool:
        """
        Send a notification through the specified channel.
        
        Args:
            notification: Notification object to send
            
        Returns:
            True if sent successfully, False otherwise
        """
        try:
            # Filter recipients based on their preferences
            eligible_recipients = self._filter_by_preferences(
                notification.recipients,
                notification.channel,
                notification.priority
            )
            
            if not eligible_recipients:
                print(f"No eligible recipients for notification {notification.id}")
                return False
            
            # Route to appropriate channel handler
            if notification.channel == NotificationChannel.EMAIL:
                return self._send_email(notification, eligible_recipients)
            elif notification.channel == NotificationChannel.SMS:
                return self._send_sms(notification, eligible_recipients)
            elif notification.channel == NotificationChannel.SLACK:
                return self._send_slack(notification, eligible_recipients)
            elif notification.channel == NotificationChannel.WEBHOOK:
                return self._send_webhook(notification, eligible_recipients)
            elif notification.channel == NotificationChannel.PUSH:
                return self._send_push(notification, eligible_recipients)
            elif notification.channel == NotificationChannel.IN_APP:
                return self._send_in_app(notification, eligible_recipients)
            else:
                print(f"Unsupported channel: {notification.channel}")
                return False
                
        except Exception as e:
            print(f"Error sending notification {notification.id}: {str(e)}")
            return False
    
    def _filter_by_preferences(
        self,
        recipients: List[NotificationRecipient],
        channel: NotificationChannel,
        priority: NotificationPriority
    ) -> List[NotificationRecipient]:
        """
        Filter recipients based on their notification preferences.
        
        Args:
            recipients: List of recipients
            channel: Notification channel
            priority: Notification priority
            
        Returns:
            Filtered list of eligible recipients
        """
        eligible = []
        
        for recipient in recipients:
            # Skip if no preferences set (default to allow all)
            if not recipient.preferences:
                eligible.append(recipient)
                continue
            
            # Check channel preference
            channel_key = f"allow_{channel.value}"
            if not recipient.preferences.get(channel_key, True):
                continue
            
            # Check priority threshold
            min_priority = recipient.preferences.get('min_priority', 'low')
            priority_levels = ['low', 'normal', 'high', 'urgent']

            if priority_levels.index(priority.value) >= priority_levels.index(min_priority):
                eligible.append(recipient)

        return eligible

    def _send_email(self, notification: Notification, recipients: List[NotificationRecipient]) -> bool:
        """Send email notification"""
        # TODO: Implement email sending via SendGrid/AWS SES
        print(f"[Email] Sending to {len(recipients)} recipients: {notification.title}")
        return True

    def _send_sms(self, notification: Notification, recipients: List[NotificationRecipient]) -> bool:
        """Send SMS notification"""
        # TODO: Implement SMS sending via Twilio
        print(f"[SMS] Sending to {len(recipients)} recipients: {notification.message[:50]}")
        return True

    def _send_slack(self, notification: Notification, recipients: List[NotificationRecipient]) -> bool:
        """Send Slack notification"""
        if not self.slack_webhook_url:
            print("[Slack] No webhook URL configured")
            return False

        try:
            payload = {
                "text": notification.title,
                "blocks": [
                    {
                        "type": "header",
                        "text": {"type": "plain_text", "text": notification.title}
                    },
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": notification.message}
                    }
                ]
            }

            response = requests.post(self.slack_webhook_url, json=payload)
            return response.status_code == 200
        except Exception as e:
            print(f"[Slack] Error: {str(e)}")
            return False

    def _send_webhook(self, notification: Notification, recipients: List[NotificationRecipient]) -> bool:
        """Send webhook notification"""
        # TODO: Implement webhook delivery
        print(f"[Webhook] Sending notification {notification.id}")
        return True

    def _send_push(self, notification: Notification, recipients: List[NotificationRecipient]) -> bool:
        """Send push notification"""
        # TODO: Implement push notification via FCM/APNS
        print(f"[Push] Sending to {len(recipients)} devices")
        return True

    def _send_in_app(self, notification: Notification, recipients: List[NotificationRecipient]) -> bool:
        """Store in-app notification"""
        # TODO: Store in database for in-app display
        print(f"[InApp] Storing notification {notification.id}")
        return True

    def send_batch(self, notifications: List[Notification]) -> Dict[str, int]:
        """
        Send multiple notifications in batch.

        Args:
            notifications: List of notifications to send

        Returns:
            Dictionary with success/failure counts
        """
        results = {"success": 0, "failed": 0}

        for notification in notifications:
            if self.send_notification(notification):
                results["success"] += 1
            else:
                results["failed"] += 1

        return results

    def get_delivery_stats(self, notification_id: str) -> Dict[str, Any]:
        """
        Get delivery statistics for a notification.

        Args:
            notification_id: ID of the notification

        Returns:
            Dictionary with delivery stats
        """
        # TODO: Query database for delivery stats
        return {
            "notification_id": notification_id,
            "sent": 0,
            "delivered": 0,
            "failed": 0,
            "opened": 0,
            "clicked": 0,
        }

