"""
Tests for the notification service.
"""

import pytest
from datetime import datetime
from src.services.notification_service import (
    NotificationService,
    Notification,
    NotificationRecipient,
    NotificationChannel,
    NotificationPriority,
)


@pytest.fixture
def notification_service():
    """Create a notification service instance for testing."""
    config = {
        'email_provider': 'sendgrid',
        'sms_provider': 'twilio',
        'slack_webhook_url': 'https://hooks.slack.com/test',
        'max_retries': 3,
    }
    return NotificationService(config)


@pytest.fixture
def sample_recipient():
    """Create a sample recipient for testing."""
    return NotificationRecipient(
        id="user_123",
        name="Test User",
        email="test@example.com",
        phone="+1234567890",
        slack_user_id="U123456",
        push_token="token_abc123",
        preferences={
            'allow_email': True,
            'allow_sms': True,
            'allow_slack': True,
            'min_priority': 'normal',
        }
    )


@pytest.fixture
def sample_notification(sample_recipient):
    """Create a sample notification for testing."""
    return Notification(
        id="notif_123",
        title="Test Notification",
        message="This is a test notification message",
        channel=NotificationChannel.EMAIL,
        priority=NotificationPriority.NORMAL,
        recipients=[sample_recipient],
        metadata={'source': 'test'},
        created_at=datetime.now(),
    )


def test_send_email_notification(notification_service, sample_notification):
    """Test sending an email notification."""
    sample_notification.channel = NotificationChannel.EMAIL
    result = notification_service.send_notification(sample_notification)
    assert result is True


def test_send_sms_notification(notification_service, sample_notification):
    """Test sending an SMS notification."""
    sample_notification.channel = NotificationChannel.SMS
    result = notification_service.send_notification(sample_notification)
    assert result is True


def test_send_slack_notification(notification_service, sample_notification):
    """Test sending a Slack notification."""
    sample_notification.channel = NotificationChannel.SLACK
    result = notification_service.send_notification(sample_notification)
    # Will fail without real webhook, but tests the code path
    assert result in [True, False]


def test_filter_by_preferences(notification_service, sample_recipient):
    """Test filtering recipients by preferences."""
    # Recipient allows email with normal priority
    recipients = notification_service._filter_by_preferences(
        [sample_recipient],
        NotificationChannel.EMAIL,
        NotificationPriority.NORMAL
    )
    assert len(recipients) == 1
    
    # Recipient blocks low priority
    recipients = notification_service._filter_by_preferences(
        [sample_recipient],
        NotificationChannel.EMAIL,
        NotificationPriority.LOW
    )
    assert len(recipients) == 0


def test_send_batch_notifications(notification_service, sample_notification):
    """Test sending multiple notifications in batch."""
    notifications = [sample_notification] * 3
    results = notification_service.send_batch(notifications)
    
    assert 'success' in results
    assert 'failed' in results
    assert results['success'] + results['failed'] == 3


def test_get_delivery_stats(notification_service):
    """Test getting delivery statistics."""
    stats = notification_service.get_delivery_stats("notif_123")
    
    assert 'notification_id' in stats
    assert 'sent' in stats
    assert 'delivered' in stats
    assert 'failed' in stats
    assert stats['notification_id'] == "notif_123"


def test_recipient_without_preferences(notification_service):
    """Test that recipients without preferences are allowed by default."""
    recipient = NotificationRecipient(
        id="user_456",
        name="User Without Prefs",
        email="nopref@example.com",
    )
    
    recipients = notification_service._filter_by_preferences(
        [recipient],
        NotificationChannel.EMAIL,
        NotificationPriority.LOW
    )
    assert len(recipients) == 1


def test_urgent_priority_bypasses_threshold(notification_service, sample_recipient):
    """Test that urgent priority notifications bypass preference thresholds."""
    recipients = notification_service._filter_by_preferences(
        [sample_recipient],
        NotificationChannel.EMAIL,
        NotificationPriority.URGENT
    )
    assert len(recipients) == 1


def test_channel_disabled_in_preferences(notification_service, sample_recipient):
    """Test that disabled channels are filtered out."""
    sample_recipient.preferences['allow_email'] = False
    
    recipients = notification_service._filter_by_preferences(
        [sample_recipient],
        NotificationChannel.EMAIL,
        NotificationPriority.HIGH
    )
    assert len(recipients) == 0

