# JWT Token to Cookie Authentication Conversion Guide

## Overview

This guide documents how to convert the authentication system from JWT tokens (stored in localStorage) back to HttpOnly cookie-based authentication.

**Time Estimate:** 10-15 minutes

**Important:** Cookie authentication will NOT work on Railway's `.up.railway.app` domains due to Public Suffix List restrictions. You must use custom domains for cookies to work across frontend/backend subdomains.

---

## Files to Modify

### Backend (1 file)
- `backend/routers/auth.py`

### Frontend (3 files)
- `frontend/lib/api/client.ts`
- `frontend/lib/stores/authStore.ts`
- `frontend/lib/api/auth.ts`

---

## Backend Changes

### File: `backend/routers/auth.py`

#### 1. Update `/login` endpoint (lines ~105-154)

**Current (JWT):**
```python
@router.post("/login")
async def login(user_data: UserLogin, request: Request):
    # ... authentication logic ...

    # Return tokens in response body (not cookies)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user
    }
```

**Change to (Cookie):**
```python
@router.post("/login")
async def login(user_data: UserLogin, response: Response, request: Request):
    # ... authentication logic ...

    # Set cookies
    set_access_token_cookie(response, access_token)
    set_refresh_token_cookie(response, refresh_token)

    return {
        "message": "Login successful",
        "user": user
    }
```

**Changes:**
- Add `response: Response` parameter
- Replace return statement with cookie-setting code
- Remove tokens from response body

---

#### 2. Update `/google/login` endpoint (lines ~157-220)

**Current (JWT):**
```python
@router.post("/google/login")
async def google_login(
    google_request: GoogleLoginRequest,
    request: Request
):
    # ... Google auth logic ...

    # Return tokens in response body
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user
    }
```

**Change to (Cookie):**
```python
@router.post("/google/login")
async def google_login(
    google_request: GoogleLoginRequest,
    response: Response,
    request: Request
):
    # ... Google auth logic ...

    # Set cookies
    set_access_token_cookie(response, access_token)
    set_refresh_token_cookie(response, refresh_token)

    return {
        "message": "Login successful",
        "user": user
    }
```

**Changes:**
- Add `response: Response` parameter
- Replace return statement with cookie-setting code
- Remove tokens from response body

---

#### 3. Update `get_current_user` dependency (lines ~32-76)

**Current (JWT - reads Authorization header):**
```python
def get_current_user(request: Request):
    """Get current user from Authorization header"""
    # Get Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract token from "Bearer <token>" format
    try:
        scheme, access_token = auth_header.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication scheme",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify token and get user...
```

**Change to (Cookie - reads from cookie):**
```python
def get_current_user(
    request: Request,
    access_token: Optional[str] = Cookie(None, alias=COOKIE_ACCESS_TOKEN_NAME)
):
    """Get current user from access token cookie"""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify token
    token_data = verify_token(access_token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user
    user = UserCRUD.get_user_by_email(token_data.email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
```

**Changes:**
- Replace Authorization header logic with cookie parameter
- Remove header parsing logic
- Simplify to direct cookie access

---

#### 4. Update `/refresh` endpoint (lines ~234-306)

**Current (JWT - reads from request body):**
```python
@router.post("/refresh")
async def refresh_token_endpoint(
    request: Request,
    response: Response
):
    """Refresh access token using refresh token from request body"""
    # Get refresh token from request body
    body = await request.json()
    refresh_token = body.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found"
        )

    # ... validation logic ...

    # Return new tokens in response body
    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }
```

**Change to (Cookie):**
```python
@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh_token_endpoint(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None, alias=COOKIE_REFRESH_TOKEN_NAME)
):
    """
    Refresh access token using refresh token cookie.
    Implements refresh token rotation for security.
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found"
        )

    # ... validation logic ...

    # Set new cookies
    set_access_token_cookie(response, access_token)
    set_refresh_token_cookie(response, new_refresh_token)

    return TokenRefreshResponse()
```

**Changes:**
- Add `refresh_token` cookie parameter
- Remove request body parsing
- Set cookies instead of returning in body
- Return simple response model

---

#### 5. Update `/logout` endpoint (lines ~308-342)

**Current (JWT - reads from request body):**
```python
@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    current_user: UserResponse = Depends(get_current_user)
):
    """Logout user by revoking refresh token"""
    try:
        # Get refresh token from request body
        body = await request.json()
        refresh_token = body.get("refresh_token")

        # Revoke refresh token if present
        if refresh_token:
            await revoke_refresh_token(refresh_token)

        return LogoutResponse(
            message="Successfully logged out",
            timestamp=datetime.utcnow()
        )
    # ... error handling ...
```

**Change to (Cookie):**
```python
@router.post("/logout", response_model=LogoutResponse)
async def logout(
    response: Response,
    current_user: UserResponse = Depends(get_current_user),
    refresh_token: Optional[str] = Cookie(None, alias=COOKIE_REFRESH_TOKEN_NAME)
):
    """
    Logout user by revoking refresh token and clearing cookies
    """
    try:
        # Revoke refresh token if present
        if refresh_token:
            await revoke_refresh_token(refresh_token)

        # Clear cookies
        clear_auth_cookies(response)

        return LogoutResponse(
            message="Successfully logged out",
            timestamp=datetime.utcnow()
        )

    except Exception as e:
        # Clear cookies anyway
        clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Logout failed: {str(e)}"
        )
```

**Changes:**
- Add `response: Response` parameter
- Add `refresh_token` cookie parameter
- Remove request body parsing
- Call `clear_auth_cookies(response)`

---

## Frontend Changes

### File: `frontend/lib/api/client.ts`

#### 1. Update axios instance (lines ~5-11)

**Current (JWT):**
```typescript
// Create axios instance
export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**Change to (Cookie):**
```typescript
// Create axios instance with cookie support
export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,  // CRITICAL: Send cookies with requests
});
```

**Changes:**
- Add `withCredentials: true`

---

#### 2. Update request interceptor (lines ~27-43)

**Current (JWT - adds Authorization header):**
```typescript
// Request interceptor - Add Authorization header from localStorage
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Get access token from localStorage
    const accessToken = localStorage.getItem('access_token');

    // Add Authorization header if token exists
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
```

**Change to (Cookie - no header needed):**
```typescript
// Request interceptor - NO LONGER NEEDED (cookies auto-attach)
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Cookies are automatically sent due to withCredentials: true
    // No need to manually add Authorization header
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
```

**Changes:**
- Remove localStorage logic
- Remove Authorization header logic
- Cookies are automatically sent

---

#### 3. Update token refresh logic (lines ~85-122)

**Current (JWT - complex refresh with localStorage):**
```typescript
try {
  // Get refresh token from localStorage
  const refreshToken = localStorage.getItem('refresh_token');

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  // Attempt to refresh token
  const response = await apiClient.post('/auth/refresh', {
    refresh_token: refreshToken
  });

  // Store new tokens
  localStorage.setItem('access_token', response.data.access_token);
  localStorage.setItem('refresh_token', response.data.refresh_token);

  // Refresh successful
  isRefreshing = false;
  onRefreshed(response.data.access_token);

  // Retry original request with new token
  originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`;
  return apiClient(originalRequest);
} catch (refreshError) {
  // Refresh failed, clear tokens and redirect to login
  isRefreshing = false;
  refreshSubscribers = [];

  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');

  if (typeof window !== 'undefined') {
    window.location.href = '/auth/login';
  }

  return Promise.reject(refreshError);
}
```

**Change to (Cookie - simple refresh):**
```typescript
try {
  // Attempt to refresh token
  await apiClient.post('/auth/refresh');

  // Refresh successful, cookies auto-updated by backend
  isRefreshing = false;
  onRefreshed('token_refreshed');

  // Retry original request
  return apiClient(originalRequest);
} catch (refreshError) {
  // Refresh failed, redirect to login
  isRefreshing = false;
  refreshSubscribers = [];

  if (typeof window !== 'undefined') {
    window.location.href = '/auth/login';
  }

  return Promise.reject(refreshError);
}
```

**Changes:**
- Remove localStorage operations
- Remove request body (refresh token sent via cookie)
- Remove Authorization header updates
- Backend handles cookie updates automatically

---

### File: `frontend/lib/stores/authStore.ts`

#### 1. Update `login` function (lines ~27-46)

**Current (JWT):**
```typescript
login: async (credentials) => {
  try {
    set({ isLoading: true, error: null });

    const response = await authApi.login(credentials);

    // Store tokens in localStorage
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);

    // Store user in state
    set({ user: response.user, isLoading: false });
  } catch (error: any) {
    set({
      error: error.response?.data?.detail || 'Login failed',
      isLoading: false,
    });
    throw error;
  }
},
```

**Change to (Cookie):**
```typescript
login: async (credentials) => {
  try {
    set({ isLoading: true, error: null });

    // Backend sets HttpOnly cookies automatically
    const response = await authApi.login(credentials);

    // Store user in memory only (NOT localStorage)
    set({ user: response.user, isLoading: false });
  } catch (error: any) {
    set({
      error: error.response?.data?.detail || 'Login failed',
      isLoading: false,
    });
    throw error;
  }
},
```

**Changes:**
- Remove localStorage operations
- Remove token handling (backend sets cookies)

---

#### 2. Update `googleLogin` function (lines ~69-88)

**Current (JWT):**
```typescript
googleLogin: async (credential) => {
  try {
    set({ isLoading: true, error: null });

    const response = await authApi.googleLogin(credential);

    // Store tokens in localStorage
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);

    // Store user in state
    set({ user: response.user, isLoading: false });
  } catch (error: any) {
    set({
      error: error.response?.data?.detail || 'Google login failed',
      isLoading: false,
    });
    throw error;
  }
},
```

**Change to (Cookie):**
```typescript
googleLogin: async (credential) => {
  try {
    set({ isLoading: true, error: null });

    // Backend sets HttpOnly cookies automatically
    const response = await authApi.googleLogin(credential);

    // Store user in memory only (NOT localStorage)
    set({ user: response.user, isLoading: false });
  } catch (error: any) {
    set({
      error: error.response?.data?.detail || 'Google login failed',
      isLoading: false,
    });
    throw error;
  }
},
```

**Changes:**
- Remove localStorage operations
- Remove token handling (backend sets cookies)

---

#### 3. Update `logout` function (lines ~90-104)

**Current (JWT):**
```typescript
logout: async () => {
  try {
    // Call logout endpoint to revoke refresh token
    await authApi.logout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear tokens from localStorage
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    // Clear user from state
    set({ user: null });
  }
},
```

**Change to (Cookie):**
```typescript
logout: async () => {
  try {
    // Call logout endpoint (clears cookies on backend)
    await authApi.logout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear user from memory
    set({ user: null });
  }
},
```

**Changes:**
- Remove localStorage operations
- Backend clears cookies automatically

---

#### 4. Update `initializeAuth` function (lines ~118-140)

**Current (JWT):**
```typescript
initializeAuth: async () => {
  // On app load, try to fetch current user if tokens exist
  set({ isInitializing: true });
  try {
    const accessToken = localStorage.getItem('access_token');

    if (accessToken) {
      // Try to fetch user with existing token
      await get().fetchUser();
    } else {
      // No token, user not authenticated
      set({ user: null });
    }
  } catch (error) {
    // Token invalid or expired, clear storage
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null });
  } finally {
    set({ isInitializing: false });
  }
},
```

**Change to (Cookie):**
```typescript
initializeAuth: async () => {
  // On app load, try to fetch current user
  // If cookies exist and are valid, backend will authenticate
  // No need to check localStorage
  set({ isInitializing: true });
  try {
    await get().fetchUser();
  } catch (error) {
    // Silent fail - user not authenticated
    set({ user: null });
  } finally {
    set({ isInitializing: false });
  }
},
```

**Changes:**
- Remove localStorage checks
- Simplify logic (backend handles authentication via cookies)

---

### File: `frontend/lib/api/auth.ts`

#### 1. Update `LoginResponse` type (lines ~4-10)

**Current (JWT):**
```typescript
// Response types with tokens
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}
```

**Change to (Cookie):**
```typescript
// Updated response types (no tokens in response body)
interface LoginResponse {
  message: string;
  user: User;
}
```

**Changes:**
- Remove token fields
- Add message field

---

#### 2. Update `logout` function (lines ~39-45)

**Current (JWT):**
```typescript
// Logout
logout: async (): Promise<void> => {
  const refreshToken = localStorage.getItem('refresh_token');
  await apiClient.post('/auth/logout', {
    refresh_token: refreshToken
  });
},
```

**Change to (Cookie):**
```typescript
// Logout
logout: async (): Promise<void> => {
  await apiClient.post('/auth/logout');
},
```

**Changes:**
- Remove localStorage access
- Remove request body (refresh token sent via cookie)

---

#### 3. Remove refresh function (lines ~47-50)

**Current (JWT):**
```typescript
// Refresh token (called automatically by interceptor)
refresh: async (): Promise<void> => {
  await apiClient.post('/auth/refresh');
},
```

**Change to (Cookie):**
```typescript
// (Remove this function - it's called directly by interceptor)
```

**Changes:**
- This function can be removed since the interceptor calls `/auth/refresh` directly

---

## Summary of Changes

### Backend
✓ Add `Response` parameter to login/google/logout endpoints
✓ Replace token returns with cookie-setting functions
✓ Update `get_current_user` to read from cookie
✓ Update `/refresh` to read/write cookies
✓ Update `/logout` to read cookie and clear cookies

### Frontend
✓ Add `withCredentials: true` to axios config
✓ Remove Authorization header logic
✓ Remove all localStorage operations (6 places)
✓ Simplify token refresh logic
✓ Update LoginResponse type

---

## Testing Checklist

After conversion:

- [ ] Login works and sets cookies
- [ ] Google login works and sets cookies
- [ ] Protected routes work (cookies sent automatically)
- [ ] Token refresh works automatically on 401
- [ ] Logout clears cookies
- [ ] Page refresh maintains authentication
- [ ] Cookies have correct attributes (HttpOnly, Secure, SameSite)

---

## Important Notes

1. **Railway Limitation**: Cookie authentication will NOT work on `.up.railway.app` domains. You must configure custom domains.

2. **CORS Configuration**: Ensure backend CORS settings allow credentials:
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=[FRONTEND_URL],  # Specific origin, not "*"
       allow_credentials=True,  # Required for cookies
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

3. **Environment Variables**:
   - Backend: `COOKIE_DOMAIN`, `COOKIE_SAMESITE`, `ENVIRONMENT`
   - Frontend: No changes needed

4. **Security**: HttpOnly cookies are more secure than localStorage for storing tokens (protected from XSS attacks).

---

## Rollback

If you need to convert back to JWT tokens, refer to the current implementation or the git commit that implemented JWT authentication.
