"""
Tests for the analytics dashboard service.
"""

import pytest
from datetime import datetime
from src.services.analytics_dashboard import (
    AnalyticsDashboard,
    DashboardWidget,
    MetricDataPoint,
    MetricType,
    TimeRange,
)


@pytest.fixture
def dashboard():
    """Create an analytics dashboard instance for testing."""
    return AnalyticsDashboard(workspace_id="test_workspace_123")


@pytest.fixture
def sample_widget():
    """Create a sample dashboard widget for testing."""
    return DashboardWidget(
        id="widget_1",
        title="Drift Detection Metrics",
        metric_type=MetricType.DRIFT_DETECTION,
        time_range=TimeRange.LAST_WEEK,
        data=[
            MetricDataPoint(
                timestamp=datetime.now(),
                value=42.0,
                metadata={"source": "test"}
            )
        ],
        summary={"total": 42, "average": 6.0}
    )


def test_dashboard_initialization(dashboard):
    """Test dashboard initialization."""
    assert dashboard.workspace_id == "test_workspace_123"
    assert len(dashboard.widgets) == 0


def test_get_drift_metrics(dashboard):
    """Test getting drift metrics."""
    metrics = dashboard.get_drift_metrics(TimeRange.LAST_WEEK)
    
    assert "total_drifts_detected" in metrics
    assert "drifts_by_type" in metrics
    assert "drifts_by_state" in metrics
    assert "average_confidence" in metrics
    assert metrics["time_range"] == "7d"


def test_get_documentation_health(dashboard):
    """Test getting documentation health metrics."""
    health = dashboard.get_documentation_health()
    
    assert "overall_health_score" in health
    assert "coverage_percentage" in health
    assert "freshness_score" in health
    assert "accuracy_score" in health
    assert "completeness_score" in health


def test_get_patch_success_rate(dashboard):
    """Test getting patch success rate metrics."""
    metrics = dashboard.get_patch_success_rate(TimeRange.LAST_DAY)
    
    assert "total_patches" in metrics
    assert "successful_patches" in metrics
    assert "failed_patches" in metrics
    assert "success_rate" in metrics
    assert metrics["time_range"] == "24h"


def test_get_response_time_metrics(dashboard):
    """Test getting response time metrics."""
    metrics = dashboard.get_response_time_metrics(TimeRange.LAST_HOUR)
    
    assert "average_detection_time_ms" in metrics
    assert "p50_total_time_ms" in metrics
    assert "p95_total_time_ms" in metrics
    assert "p99_total_time_ms" in metrics
    assert metrics["time_range"] == "1h"


def test_add_widget(dashboard, sample_widget):
    """Test adding a widget to the dashboard."""
    dashboard.add_widget(sample_widget)
    assert len(dashboard.widgets) == 1
    assert dashboard.widgets[0].id == "widget_1"


def test_remove_widget(dashboard, sample_widget):
    """Test removing a widget from the dashboard."""
    dashboard.add_widget(sample_widget)
    assert len(dashboard.widgets) == 1
    
    result = dashboard.remove_widget("widget_1")
    assert result is True
    assert len(dashboard.widgets) == 0
    
    # Try removing non-existent widget
    result = dashboard.remove_widget("widget_999")
    assert result is False


def test_get_widget(dashboard, sample_widget):
    """Test getting a widget by ID."""
    dashboard.add_widget(sample_widget)
    
    widget = dashboard.get_widget("widget_1")
    assert widget is not None
    assert widget.id == "widget_1"
    assert widget.title == "Drift Detection Metrics"
    
    # Try getting non-existent widget
    widget = dashboard.get_widget("widget_999")
    assert widget is None


def test_export_to_json(dashboard, sample_widget):
    """Test exporting dashboard to JSON."""
    dashboard.add_widget(sample_widget)
    
    export = dashboard.export_to_json()
    
    assert export["workspace_id"] == "test_workspace_123"
    assert "exported_at" in export
    assert len(export["widgets"]) == 1
    assert export["widgets"][0]["id"] == "widget_1"
    assert export["widgets"][0]["metric_type"] == "drift_detection"


def test_get_summary_stats(dashboard):
    """Test getting summary statistics."""
    stats = dashboard.get_summary_stats()
    
    assert stats["workspace_id"] == "test_workspace_123"
    assert "total_drifts_detected" in stats
    assert "documentation_health_score" in stats
    assert "patch_success_rate" in stats
    assert "active_widgets" in stats
    assert "last_updated" in stats
    assert stats["active_widgets"] == 0


def test_multiple_widgets(dashboard):
    """Test managing multiple widgets."""
    widget1 = DashboardWidget(
        id="w1", title="Widget 1", metric_type=MetricType.DRIFT_DETECTION,
        time_range=TimeRange.LAST_DAY, data=[], summary={}
    )
    widget2 = DashboardWidget(
        id="w2", title="Widget 2", metric_type=MetricType.PATCH_SUCCESS_RATE,
        time_range=TimeRange.LAST_WEEK, data=[], summary={}
    )
    
    dashboard.add_widget(widget1)
    dashboard.add_widget(widget2)
    
    assert len(dashboard.widgets) == 2
    assert dashboard.get_widget("w1") is not None
    assert dashboard.get_widget("w2") is not None

