import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace with your local machine's IP address if testing on a real phone!
const BASE_URL = 'http://10.0.2.2:3000/api'; 

/**
 * Utility to attach the stored token to authenticated requests
 */
const getHeaders = async () => {
  const token = await AsyncStorage.getItem('userToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};

export const authService = {
  // 1. REGISTER
  register: async (username, email, password) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed');
      return data;
    } catch (error) {
      console.error('Registration Error:', error.message);
      throw error;
    }
  },

  // 2. LOGIN
  login: async (email, password) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed');

      // If backend returns a JWT token, persist it locally
      if (data.token) {
        await AsyncStorage.setItem('userToken', data.token);
      }
      return data;
    } catch (error) {
      console.error('Login Error:', error.message);
      throw error;
    }
  },

  // 3. PROFILE TRACKING (Fetch current user data)
  getProfile: async () => {
    try {
      const headers = await getHeaders();
      const response = await fetch(`${BASE_URL}/auth/profile`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok) {
        // If token expired or invalid, handle authorization kickout
        if (response.status === 401) {
          await AsyncStorage.removeItem('userToken');
        }
        throw new Error(data.message || 'Failed to fetch profile');
      }
      return data;
    } catch (error) {
      console.error('Profile Error:', error.message);
      throw error;
    }
  },

  // 4. LOGOUT
  logout: async () => {
    await AsyncStorage.removeItem('userToken');
  }
};