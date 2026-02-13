"""
Tests for the Analytics Service.

This test suite covers:
- Event tracking functionality
- Metrics retrieval
- Data export capabilities
- Cache management
"""

import pytest
import json
import os
from datetime import datetime
from src.services.analytics import AnalyticsService, create_analytics_service


class TestAnalyticsService:
    """Test suite for AnalyticsService class."""
    
    def setup_method(self):
        """Set up test fixtures before each test method."""
        self.service = AnalyticsService()
    
    def test_initialization(self):
        """Test that service initializes correctly."""
        assert self.service is not None
        assert isinstance(self.service.metrics_cache, dict)
        assert len(self.service.metrics_cache) == 0
    
    def test_track_event_success(self):
        """Test successful event tracking."""
        result = self.service.track_event('user_login', {'user_id': '123'})
        assert result is True
        assert 'user_login' in self.service.metrics_cache
        assert len(self.service.metrics_cache['user_login']) == 1
    
    def test_track_event_empty_name(self):
        """Test that empty event names are rejected."""
        result = self.service.track_event('', {'data': 'test'})
        assert result is False
    
    def test_track_multiple_events(self):
        """Test tracking multiple events of the same type."""
        self.service.track_event('page_view', {'page': '/home'})
        self.service.track_event('page_view', {'page': '/about'})
        self.service.track_event('page_view', {'page': '/contact'})
        
        assert len(self.service.metrics_cache['page_view']) == 3
    
    def test_get_metrics_specific_event(self):
        """Test retrieving metrics for a specific event."""
        self.service.track_event('button_click', {'button': 'submit'})
        metrics = self.service.get_metrics('button_click')
        
        assert metrics['event'] == 'button_click'
        assert metrics['count'] == 1
        assert len(metrics['data']) == 1
    
    def test_get_metrics_all_events(self):
        """Test retrieving all metrics."""
        self.service.track_event('event1', {'data': '1'})
        self.service.track_event('event2', {'data': '2'})
        
        metrics = self.service.get_metrics()
        assert metrics['total_events'] == 2
        assert len(metrics['event_types']) == 2
        assert 'uptime' in metrics
    
    def test_export_to_json(self, tmp_path):
        """Test exporting metrics to JSON file."""
        self.service.track_event('test_event', {'test': 'data'})
        
        filepath = tmp_path / "metrics.json"
        result = self.service.export_to_json(str(filepath))
        
        assert result is True
        assert filepath.exists()
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        assert 'test_event' in data
    
    def test_clear_specific_event(self):
        """Test clearing metrics for a specific event."""
        self.service.track_event('event1', {'data': '1'})
        self.service.track_event('event2', {'data': '2'})
        
        self.service.clear_metrics('event1')
        
        assert 'event1' not in self.service.metrics_cache
        assert 'event2' in self.service.metrics_cache
    
    def test_clear_all_metrics(self):
        """Test clearing all metrics."""
        self.service.track_event('event1', {'data': '1'})
        self.service.track_event('event2', {'data': '2'})
        
        self.service.clear_metrics()
        
        assert len(self.service.metrics_cache) == 0
    
    def test_factory_function(self):
        """Test the factory function creates a valid service."""
        service = create_analytics_service({'debug': True})
        assert isinstance(service, AnalyticsService)
        assert service.config == {'debug': True}


class TestAnalyticsIntegration:
    """Integration tests for analytics service."""
    
    def test_full_workflow(self, tmp_path):
        """Test a complete analytics workflow."""
        # Create service
        service = create_analytics_service()
        
        # Track various events
        service.track_event('user_signup', {'email': 'test@example.com'})
        service.track_event('user_login', {'user_id': '123'})
        service.track_event('user_login', {'user_id': '456'})
        
        # Get metrics
        metrics = service.get_metrics()
        assert metrics['total_events'] == 3
        
        # Export data
        filepath = tmp_path / "export.json"
        service.export_to_json(str(filepath))
        assert filepath.exists()
        
        # Clear and verify
        service.clear_metrics()
        assert service.get_metrics()['total_events'] == 0

