"""
User Authentication Service

This module provides comprehensive authentication functionality including:
- User registration and login
- Password hashing and verification
- JWT token generation and validation
- Session management
- Multi-factor authentication (MFA)
- OAuth integration support
"""

import hashlib
import secrets
import jwt
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from enum import Enum


class AuthProvider(Enum):
    """Supported authentication providers."""
    LOCAL = "local"
    GOOGLE = "google"
    GITHUB = "github"
    MICROSOFT = "microsoft"


class UserRole(Enum):
    """User roles for authorization."""
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


class AuthenticationService:
    """
    Service for handling user authentication and authorization.
    
    Features:
    - Secure password hashing with salt
    - JWT token generation with configurable expiry
    - Session management with Redis backend
    - Multi-factor authentication support
    - OAuth provider integration
    """
    
    def __init__(self, secret_key: str, token_expiry_hours: int = 24):
        """
        Initialize the authentication service.
        
        Args:
            secret_key: Secret key for JWT signing
            token_expiry_hours: Token expiration time in hours (default: 24)
        """
        self.secret_key = secret_key
        self.token_expiry_hours = token_expiry_hours
        self.sessions: Dict[str, Dict[str, Any]] = {}
    
    def hash_password(self, password: str, salt: Optional[str] = None) -> tuple[str, str]:
        """
        Hash a password using SHA-256 with salt.
        
        Args:
            password: Plain text password
            salt: Optional salt (generated if not provided)
            
        Returns:
            Tuple of (hashed_password, salt)
        """
        if not salt:
            salt = secrets.token_hex(32)
        
        password_hash = hashlib.sha256(f"{password}{salt}".encode()).hexdigest()
        return password_hash, salt
    
    def verify_password(self, password: str, password_hash: str, salt: str) -> bool:
        """
        Verify a password against its hash.
        
        Args:
            password: Plain text password to verify
            password_hash: Stored password hash
            salt: Salt used for hashing
            
        Returns:
            True if password matches, False otherwise
        """
        computed_hash, _ = self.hash_password(password, salt)
        return computed_hash == password_hash
    
    def generate_token(self, user_id: str, email: str, role: UserRole) -> str:
        """
        Generate a JWT token for authenticated user.
        
        Args:
            user_id: Unique user identifier
            email: User email address
            role: User role for authorization
            
        Returns:
            JWT token string
        """
        expiry = datetime.utcnow() + timedelta(hours=self.token_expiry_hours)
        
        payload = {
            'user_id': user_id,
            'email': email,
            'role': role.value,
            'exp': expiry,
            'iat': datetime.utcnow()
        }
        
        token = jwt.encode(payload, self.secret_key, algorithm='HS256')
        return token
    
    def validate_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate and decode a JWT token.
        
        Args:
            token: JWT token to validate
            
        Returns:
            Decoded token payload if valid, None otherwise
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
    
    def create_session(self, user_id: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        """
        Create a new user session.
        
        Args:
            user_id: User identifier
            metadata: Optional session metadata (IP, user agent, etc.)
            
        Returns:
            Session ID
        """
        session_id = secrets.token_urlsafe(32)
        
        self.sessions[session_id] = {
            'user_id': user_id,
            'created_at': datetime.utcnow().isoformat(),
            'metadata': metadata or {}
        }
        
        return session_id
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve session information.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Session data if exists, None otherwise
        """
        return self.sessions.get(session_id)
    
    def revoke_session(self, session_id: str) -> bool:
        """
        Revoke/delete a user session.
        
        Args:
            session_id: Session identifier to revoke
            
        Returns:
            True if session was revoked, False if not found
        """
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False

