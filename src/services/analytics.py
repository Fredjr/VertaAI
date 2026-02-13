"""
Analytics Service for tracking user metrics and system performance.

This module provides functionality to:
- Track user activity metrics
- Monitor system performance
- Generate analytics reports
- Export data in various formats
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import json


class AnalyticsService:
    """Service for tracking and analyzing user metrics."""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the analytics service.
        
        Args:
            config: Optional configuration dictionary
        """
        self.config = config or {}
        self.metrics_cache: Dict[str, List[Dict]] = {}
        self.start_time = datetime.now()
    
    def track_event(self, event_name: str, properties: Dict[str, Any]) -> bool:
        """
        Track a user event with associated properties.
        
        Args:
            event_name: Name of the event to track
            properties: Dictionary of event properties
            
        Returns:
            True if event was tracked successfully
        """
        if not event_name:
            return False
            
        event_data = {
            'event': event_name,
            'timestamp': datetime.now().isoformat(),
            'properties': properties
        }
        
        if event_name not in self.metrics_cache:
            self.metrics_cache[event_name] = []
        
        self.metrics_cache[event_name].append(event_data)
        return True
    
    def get_metrics(self, event_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Retrieve metrics for a specific event or all events.
        
        Args:
            event_name: Optional event name to filter by
            
        Returns:
            Dictionary containing metrics data
        """
        if event_name:
            return {
                'event': event_name,
                'count': len(self.metrics_cache.get(event_name, [])),
                'data': self.metrics_cache.get(event_name, [])
            }
        
        return {
            'total_events': sum(len(events) for events in self.metrics_cache.values()),
            'event_types': list(self.metrics_cache.keys()),
            'uptime': (datetime.now() - self.start_time).total_seconds()
        }
    
    def export_to_json(self, filepath: str) -> bool:
        """
        Export all metrics to a JSON file.
        
        Args:
            filepath: Path to the output JSON file
            
        Returns:
            True if export was successful
        """
        try:
            with open(filepath, 'w') as f:
                json.dump(self.metrics_cache, f, indent=2)
            return True
        except Exception as e:
            print(f"Error exporting metrics: {e}")
            return False
    
    def clear_metrics(self, event_name: Optional[str] = None) -> None:
        """
        Clear metrics for a specific event or all events.
        
        Args:
            event_name: Optional event name to clear, or None to clear all
        """
        if event_name:
            self.metrics_cache.pop(event_name, None)
        else:
            self.metrics_cache.clear()


def create_analytics_service(config: Optional[Dict[str, Any]] = None) -> AnalyticsService:
    """
    Factory function to create an analytics service instance.
    
    Args:
        config: Optional configuration dictionary
        
    Returns:
        Configured AnalyticsService instance
    """
    return AnalyticsService(config)

