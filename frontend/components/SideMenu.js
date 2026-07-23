import React, { useState, useEffect, useRef } from 'react';
import './global.css';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';

import AdminView from './components/AdminView';
import ChatView from './components/ChatView';
import FeedView from './components/FeedView';

// ============================================================================
// CONFIGURATION & ASSETS
// ============================================================================
const API_URL = 'https://robotech-backend-bc05.onrender.com/api'; 
const SOCKET_URL = 'https://robotech-backend-bc05.onrender.com';

const ClubLogo = require('./assets/logo.png');

const socket = io(SOCKET_URL, {
  autoConnect: false,
});

// ============================================================================
// MAIN APPLICATION ROOT
// ============================================================================
export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // App Navigation State
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'chat' | 'admin'

  useEffect(() => {
    const checkToken = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('userToken');
        const storedUser = await AsyncStorage.getItem('userData');
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        setLoading(false);
      }
    };
    checkToken();
  }, []);

  const handleAuth = async () => {
    setAuthError('');
    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    
    const payload = isLogin 
      ? { email: email.trim(), password } 
      : { name: name.trim(), email: email.trim(), password };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      if (isLogin) {
        await AsyncStorage.setItem('userToken', data.token);
        await AsyncStorage.setItem('userData', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      } else {
        setIsLogin(true);
        setName('');
        setEmail('');
        setPassword('');
        setAuthError('Registration pending admin approval!');
      }
    } catch (err) {
      console.error('Network catch error:', err);
      setAuthError('Network error connecting to backend. Check your IP/port.');
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    socket.disconnect();
    setToken(null);
    setUser(null);
    setActiveTab('feed');
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#05070a] justify-center items-center">
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  // --- AUTHENTICATION SCREEN ---
  if (!token) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-[#05070a] justify-center p-6"
      >
        <StatusBar barStyle="light-content" />
        <View className="bg-[#0b0f19] p-7 rounded-3xl border border-slate-800/80 shadow-2xl">
          <View className="items-center mb-6">
            <View className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 justify-center items-center mb-3 overflow-hidden shadow-lg shadow-amber-500/10">
              <Image source={ClubLogo} className="w-10 h-10" resizeMode="contain" />
            </View>
            <Text className="text-amber-400 font-extrabold text-3xl tracking-tight">ROBOTECH</Text>
            <Text className="text-slate-400 text-xs mt-1">
              {isLogin ? 'Welcome back, builder!' : 'Join the elite engineering network'}
            </Text>
          </View>

          {authError ? (
            <View className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4">
              <Text className="text-rose-400 text-xs text-center font-medium">{authError}</Text>
            </View>
          ) : null}

          {!isLogin && (
            <TextInput
              placeholder="Full Name"
              placeholderTextColor="#64748b"
              value={name}
              onChangeText={setName}
              className="bg-[#05070a] text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium"
            />
          )}

          <TextInput
            placeholder="Email Address"
            placeholderTextColor="#64748b"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            className="bg-[#05070a] text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium"
          />

          <TextInput
            placeholder="Password"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            className="bg-[#05070a] text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-5 font-medium"
          />

          <TouchableOpacity
            onPress={handleAuth}
            className="bg-amber-500 py-4 rounded-xl justify-center items-center active:scale-[0.98] shadow-lg shadow-amber-500/20 mb-5"
          >
            <Text className="text-slate-950 font-black text-xs uppercase tracking-widest">
              {isLogin ? 'Sign In' : 'Register Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} className="py-1">
            <Text className="text-slate-400 text-xs text-center">
              {isLogin ? "Don't have an account? " : 'Already registered? '}
              <Text className="text-amber-400 font-bold">{isLogin ? 'Sign Up' : 'Log In'}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // --- MAIN AUTHENTICATED APP ---
  const isAdmin = user?.role === 'admin';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#05070a' }} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      {/* Global Header */}
      <View className="flex-row justify-between items-center px-5 py-3.5 border-b border-slate-800/80 bg-[#0b0f19] shadow-md">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 justify-center items-center overflow-hidden">
            <Image source={ClubLogo} className="w-6 h-6" resizeMode="contain" />
          </View>
          <View>
            <Text className="text-amber-400 font-black text-lg tracking-wider">ROBOTECH</Text>
            <Text className="text-slate-400 text-[10px] font-medium">
              {user?.name} • <Text className="text-amber-500/80 uppercase">{user?.role || 'Member'}</Text>
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleLogout}
          className="bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-800"
        >
          <Text className="text-rose-400 font-bold text-xs">Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Safe Screen Container (No outer KeyboardAvoidingView locking hits) */}
      <View style={{ flex: 1 }}>
        {activeTab === 'feed' && <FeedView user={user} token={token} />}
        {activeTab === 'chat' && <ChatView user={user} token={token} />}
        {activeTab === 'admin' && isAdmin && <AdminView token={token} />}
      </View>

      {/* Bottom Navigation Bar */}
      <View className="flex-row border-t border-slate-800/80 bg-[#0b0f19] px-4 py-2.5 gap-2">
        <TouchableOpacity
          onPress={() => setActiveTab('feed')}
          className={`flex-1 py-3 rounded-2xl justify-center items-center flex-row gap-1.5 ${
            activeTab === 'feed' ? 'bg-amber-500/15 border border-amber-500/40' : 'bg-transparent'
          }`}
        >
          <Text className="text-sm">📰</Text>
          <Text className={`font-bold text-[11px] tracking-wide ${activeTab === 'feed' ? 'text-amber-400' : 'text-slate-400'}`}>
            Feed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('chat')}
          className={`flex-1 py-3 rounded-2xl justify-center items-center flex-row gap-1.5 ${
            activeTab === 'chat' ? 'bg-amber-500/15 border border-amber-500/40' : 'bg-transparent'
          }`}
        >
          <Text className="text-sm">💬</Text>
          <Text className={`font-bold text-[11px] tracking-wide ${activeTab === 'chat' ? 'text-amber-400' : 'text-slate-400'}`}>
            Chat
          </Text>
        </TouchableOpacity>

        {isAdmin && (
          <TouchableOpacity
            onPress={() => setActiveTab('admin')}
            className={`flex-1 py-3 rounded-2xl justify-center items-center flex-row gap-1.5 ${
              activeTab === 'admin' ? 'bg-amber-500/15 border border-amber-500/40' : 'bg-transparent'
            }`}
          >
            <Text className="text-sm">🛡️</Text>
            <Text className={`font-bold text-[11px] tracking-wide ${activeTab === 'admin' ? 'text-amber-400' : 'text-slate-400'}`}>
              Admin
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

