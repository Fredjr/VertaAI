"""
Unit tests for the Authentication Service.

Tests cover:
- Password hashing and verification
- JWT token generation and validation
- Session management
- Edge cases and error handling
"""

import pytest
import jwt
from datetime import datetime, timedelta
from src.services.auth import AuthenticationService, UserRole, AuthProvider


class TestPasswordHashing:
    """Test password hashing functionality."""
    
    def test_hash_password_generates_salt(self):
        """Test that hash_password generates a salt if not provided."""
        auth = AuthenticationService(secret_key="test_secret")
        password = "secure_password_123"
        
        hash1, salt1 = auth.hash_password(password)
        hash2, salt2 = auth.hash_password(password)
        
        # Different salts should produce different hashes
        assert salt1 != salt2
        assert hash1 != hash2
    
    def test_hash_password_with_provided_salt(self):
        """Test that hash_password uses provided salt."""
        auth = AuthenticationService(secret_key="test_secret")
        password = "secure_password_123"
        salt = "fixed_salt_for_testing"
        
        hash1, returned_salt1 = auth.hash_password(password, salt)
        hash2, returned_salt2 = auth.hash_password(password, salt)
        
        # Same salt should produce same hash
        assert hash1 == hash2
        assert returned_salt1 == returned_salt2 == salt
    
    def test_verify_password_success(self):
        """Test successful password verification."""
        auth = AuthenticationService(secret_key="test_secret")
        password = "my_secure_password"
        
        password_hash, salt = auth.hash_password(password)
        
        assert auth.verify_password(password, password_hash, salt) is True
    
    def test_verify_password_failure(self):
        """Test failed password verification with wrong password."""
        auth = AuthenticationService(secret_key="test_secret")
        password = "correct_password"
        wrong_password = "wrong_password"
        
        password_hash, salt = auth.hash_password(password)
        
        assert auth.verify_password(wrong_password, password_hash, salt) is False


class TestJWTTokens:
    """Test JWT token generation and validation."""
    
    def test_generate_token(self):
        """Test JWT token generation."""
        auth = AuthenticationService(secret_key="test_secret", token_expiry_hours=24)
        
        token = auth.generate_token(
            user_id="user_123",
            email="test@example.com",
            role=UserRole.USER
        )
        
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_validate_token_success(self):
        """Test successful token validation."""
        auth = AuthenticationService(secret_key="test_secret", token_expiry_hours=24)
        
        token = auth.generate_token(
            user_id="user_123",
            email="test@example.com",
            role=UserRole.ADMIN
        )
        
        payload = auth.validate_token(token)
        
        assert payload is not None
        assert payload['user_id'] == "user_123"
        assert payload['email'] == "test@example.com"
        assert payload['role'] == UserRole.ADMIN.value
    
    def test_validate_token_invalid(self):
        """Test validation of invalid token."""
        auth = AuthenticationService(secret_key="test_secret")
        
        invalid_token = "invalid.token.here"
        payload = auth.validate_token(invalid_token)
        
        assert payload is None
    
    def test_validate_token_wrong_secret(self):
        """Test validation fails with wrong secret."""
        auth1 = AuthenticationService(secret_key="secret_1")
        auth2 = AuthenticationService(secret_key="secret_2")
        
        token = auth1.generate_token("user_123", "test@example.com", UserRole.USER)
        payload = auth2.validate_token(token)
        
        assert payload is None


class TestSessionManagement:
    """Test session management functionality."""
    
    def test_create_session(self):
        """Test session creation."""
        auth = AuthenticationService(secret_key="test_secret")
        
        session_id = auth.create_session(
            user_id="user_123",
            metadata={"ip": "192.168.1.1", "user_agent": "Mozilla/5.0"}
        )
        
        assert isinstance(session_id, str)
        assert len(session_id) > 0
    
    def test_get_session(self):
        """Test retrieving session data."""
        auth = AuthenticationService(secret_key="test_secret")
        
        metadata = {"ip": "192.168.1.1"}
        session_id = auth.create_session("user_123", metadata)
        
        session = auth.get_session(session_id)
        
        assert session is not None
        assert session['user_id'] == "user_123"
        assert session['metadata'] == metadata
        assert 'created_at' in session
    
    def test_get_nonexistent_session(self):
        """Test retrieving non-existent session."""
        auth = AuthenticationService(secret_key="test_secret")
        
        session = auth.get_session("nonexistent_session_id")
        
        assert session is None
    
    def test_revoke_session(self):
        """Test session revocation."""
        auth = AuthenticationService(secret_key="test_secret")
        
        session_id = auth.create_session("user_123")
        
        # Session should exist
        assert auth.get_session(session_id) is not None
        
        # Revoke session
        result = auth.revoke_session(session_id)
        assert result is True
        
        # Session should no longer exist
        assert auth.get_session(session_id) is None
    
    def test_revoke_nonexistent_session(self):
        """Test revoking non-existent session."""
        auth = AuthenticationService(secret_key="test_secret")
        
        result = auth.revoke_session("nonexistent_session_id")
        
        assert result is False

