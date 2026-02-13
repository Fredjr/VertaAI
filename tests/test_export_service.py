"""
Tests for Export Service
"""

import json
import pytest
from datetime import datetime
from src.services.export_service import ExportService


@pytest.fixture
def export_service():
    """Create ExportService instance"""
    return ExportService()


@pytest.fixture
def sample_drift_data():
    """Sample drift data for testing"""
    return [
        {
            'id': 'drift-001',
            'workspace_id': 'ws-123',
            'state': 'COMPLETED',
            'created_at': '2026-02-13T10:00:00Z',
            'drift_type': 'api_change'
        },
        {
            'id': 'drift-002',
            'workspace_id': 'ws-123',
            'state': 'PATCH_GENERATED',
            'created_at': '2026-02-13T11:00:00Z',
            'drift_type': 'coverage_gap'
        }
    ]


def test_export_json_with_metadata(export_service, sample_drift_data):
    """Test JSON export with metadata"""
    result = export_service.export_drift_results(
        sample_drift_data,
        format='json',
        include_metadata=True
    )
    
    data = json.loads(result.decode('utf-8'))
    
    assert 'exported_at' in data
    assert 'total_records' in data
    assert data['total_records'] == 2
    assert 'data' in data
    assert len(data['data']) == 2


def test_export_json_without_metadata(export_service, sample_drift_data):
    """Test JSON export without metadata"""
    result = export_service.export_drift_results(
        sample_drift_data,
        format='json',
        include_metadata=False
    )
    
    data = json.loads(result.decode('utf-8'))
    
    assert 'exported_at' not in data
    assert 'total_records' not in data
    assert 'data' in data
    assert len(data['data']) == 2


def test_export_csv(export_service, sample_drift_data):
    """Test CSV export"""
    result = export_service.export_drift_results(
        sample_drift_data,
        format='csv',
        include_metadata=True
    )
    
    csv_content = result.decode('utf-8')
    lines = csv_content.strip().split('\n')
    
    # Should have header + 2 data rows
    assert len(lines) == 3
    assert 'id' in lines[0]
    assert 'workspace_id' in lines[0]
    assert 'drift-001' in lines[1]
    assert 'drift-002' in lines[2]


def test_unsupported_format(export_service, sample_drift_data):
    """Test error handling for unsupported format"""
    with pytest.raises(ValueError, match="Unsupported format"):
        export_service.export_drift_results(
            sample_drift_data,
            format='xml'
        )


def test_export_analytics_summary(export_service):
    """Test analytics summary export"""
    result = export_service.export_analytics_summary(
        workspace_id='ws-123',
        start_date=datetime(2026, 2, 1),
        end_date=datetime(2026, 2, 13),
        format='json'
    )
    
    data = json.loads(result.decode('utf-8'))
    
    assert 'data' in data
    assert len(data['data']) == 1
    summary = data['data'][0]
    assert summary['workspace_id'] == 'ws-123'
    assert 'metrics' in summary
    assert 'total_drifts_detected' in summary['metrics']


def test_stream_export(export_service):
    """Test streaming export"""
    # Create iterator with 250 records
    def data_generator():
        for i in range(250):
            yield {'id': f'drift-{i:03d}', 'index': i}
    
    chunks = list(export_service.stream_export(
        data_generator(),
        format='json',
        chunk_size=100
    ))
    
    # Should have 3 chunks (100 + 100 + 50)
    assert len(chunks) == 3
    
    # Verify first chunk has 100 records
    chunk1_data = json.loads(chunks[0].decode('utf-8'))
    assert chunk1_data['total_records'] == 100

