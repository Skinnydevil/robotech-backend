import './global.css';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Animated,
  Keyboard,
  Modal,
  Alert,
  StyleSheet,
  Button,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  Menu,
  Settings,
  LayoutGrid,
  MessageSquare,
  ShieldAlert,
  Lock,
  User,
  CheckCircle2,
  Calendar as CalendarIcon,
  QrCode,
  X,
} from 'lucide-react-native';

import AdminView from './components/AdminView';
import ChatView from './components/ChatView';
import FeedView from './components/FeedView';
import CalendarView from './components/CalendarView';
import SideMenu from './components/SideMenu';

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';
const SOCKET_URL = 'https://robotech-backend-bc05.onrender.com';
const ClubLogo = require('./assets/logo.png');

function MainAppContent() {
  const insets = useSafeAreaInsets();

  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth State
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // App Navigation & Drawer
  const [activeTab, setActiveTab] = useState('feed');
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  // Profile Settings State
  const [updateName, setUpdateName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [settingsMsg, setSettingsMsg] = useState({ type: '', text: '' });

  // Assembly Check-In Scanner State
  const [scannerVisible, setScannerVisible] = useState(false);
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const socketRef = useRef(null);
  const isScanningRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Immediate State-Switch Navigation
  const changeTab = (newTab) => {
    if (newTab === activeTab) return;

    setActiveTab(newTab);

    fadeAnim.setValue(0.85);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    const checkToken = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('userToken');
        const storedUser = await AsyncStorage.getItem('userData');
        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          setUpdateName(parsedUser.name || '');
        }
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        setLoading(false);
      }
    };
    checkToken();
  }, []);

  useEffect(() => {
    if (token) {
      socketRef.current = io(SOCKET_URL, {
        autoConnect: true,
        auth: { token },
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token]);

  const handleAuth = async () => {
    Keyboard.dismiss();
    setAuthError('');
    if (!email.trim() || !password) {
      setAuthError('Please fill in all required fields.');
      return;
    }
    if (!isLogin && !name.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }

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
        setUpdateName(data.user.name || '');
      } else {
        setIsLogin(true);
        setName('');
        setEmail('');
        setPassword('');
        setAuthError('Registration submitted! Awaiting admin approval.');
      }
    } catch (err) {
      setAuthError('Network connection error. Check your backend status.');
    }
  };

  const handleUpdateProfile = async () => {
    Keyboard.dismiss();
    setSettingsMsg({ type: '', text: '' });
    try {
      const res = await fetch(`${API_URL}/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: updateName,
          currentPassword,
          newPassword: newPassword || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSettingsMsg({ type: 'error', text: data.error || 'Update failed' });
        return;
      }

      const updatedUser = { ...user, name: updateName };
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      setCurrentPassword('');
      setNewPassword('');
      setSettingsMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setSettingsMsg({ type: 'error', text: 'Failed to update profile.' });
    }
  };

  // Assembly Check-In QR Handler for Expo Camera
  const handleBarcodeScanned = async ({ data: rawData }) => {
    if (isSubmittingCheckIn || isScanningRef.current) return;

    isScanningRef.current = true;
    setIsSubmittingCheckIn(true);

    try {
      let sessionId = null;

      // Extract sessionId from potential URL payload formats or raw text
      if (rawData.includes('sessionId=')) {
        const match = rawData.match(/sessionId=([^&]+)/);
        if (match) sessionId = match[1];
      } else if (rawData.includes('robotech://checkin')) {
        const urlParams = new URLSearchParams(rawData.split('?')[1]);
        sessionId = urlParams.get('sessionId');
      } else {
        // Fallback: assume raw string is the Mongo session ID directly
        sessionId = rawData.trim();
      }

      if (!sessionId) {
        Alert.alert('Invalid Code', 'This QR code is not a valid assembly session token.');
        setIsSubmittingCheckIn(false);
        isScanningRef.current = false;
        return;
      }

      const res = await fetch(`${API_URL}/assembly/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      const data = await res.json();

      if (res.ok) {
        setScannerVisible(false);
        Alert.alert('Check-In Confirmed! 🎯', data.message || 'You are marked present for this assembly.');
      } else {
        Alert.alert('Check-In Failed', data.error || 'Could not register attendance.', [
          {
            text: 'Try Again',
            onPress: () => {
              isScanningRef.current = false;
            },
          },
        ]);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to connect to check-in server.', [
        {
          text: 'OK',
          onPress: () => {
            isScanningRef.current = false;
          },
        },
      ]);
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  const openScannerModal = () => {
    isScanningRef.current = false;
    setScannerVisible(true);
  };

  const closeScannerModal = () => {
    isScanningRef.current = false;
    setScannerVisible(false);
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove(['userToken', 'userData']);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    } catch (e) {
      console.error('Error during logout:', e);
    } finally {
      setToken(null);
      setUser(null);
      setActiveTab('feed');
      setSideMenuOpen(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  const isAdmin = user?.role === 'admin';

  return (
    <View className="flex-1 bg-slate-950">
      {!token ? (
        /* --- AUTHENTICATION SCREEN --- */
        <SafeAreaView className="flex-1 bg-slate-950">
          <StatusBar barStyle="light-content" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
              keyboardShouldPersistTaps="handled"
              className="p-6 bg-slate-950"
            >
              <View className="bg-slate-900 p-7 rounded-3xl border border-amber-500/20 shadow-lg shadow-amber-500/10">
                <View className="items-center mb-6">
                  <View className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 justify-center items-center mb-3 overflow-hidden">
                    <Image source={ClubLogo} className="w-10 h-10" resizeMode="contain" />
                  </View>
                  <Text className="text-amber-500 font-black text-3xl tracking-widest">ROBOTECH</Text>
                  <Text className="text-slate-400 text-xs mt-1 font-medium">
                    {isLogin ? 'Engineering Network Access' : 'Create Builder Account'}
                  </Text>
                </View>

                {authError ? (
                  <View className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl mb-4">
                    <Text className="text-rose-400 text-xs text-center font-medium">{authError}</Text>
                  </View>
                ) : null}

                {!isLogin && (
                  <TextInput
                    placeholder="Full Name"
                    placeholderTextColor="#475569"
                    value={name}
                    onChangeText={setName}
                    autoCorrect={false}
                    className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium"
                  />
                )}

                <TextInput
                  placeholder="Email Address"
                  placeholderTextColor="#475569"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                  className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium"
                />

                <TextInput
                  placeholder="Password"
                  placeholderTextColor="#475569"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-5 font-medium"
                />

                <TouchableOpacity
                  onPress={handleAuth}
                  activeOpacity={0.8}
                  className="bg-amber-500 py-4 rounded-xl items-center mb-5 shadow-md shadow-amber-500/20"
                >
                  <Text className="text-slate-950 font-black text-xs uppercase tracking-widest">
                    {isLogin ? 'Sign In' : 'Register Account'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setIsLogin(!isLogin)} className="py-1">
                  <Text className="text-slate-400 text-xs text-center">
                    {isLogin ? "Don't have an account? " : 'Already registered? '}
                    <Text className="text-amber-500 font-bold">{isLogin ? 'Sign Up' : 'Log In'}</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      ) : (
        /* --- MAIN APP INTERFACE --- */
        <SafeAreaView className="flex-1 bg-slate-950" edges={['top', 'left', 'right']}>
          <StatusBar barStyle="light-content" />

          {/* Top Header */}
          <View className="flex-row justify-between items-center px-5 py-3.5 border-b border-slate-800/80 bg-slate-900">
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => setSideMenuOpen(true)}
                className="bg-slate-950 border border-amber-500/30 p-2.5 rounded-xl"
              >
                <Menu size={18} color="#f59e0b" />
              </TouchableOpacity>

              <View className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 justify-center items-center overflow-hidden">
                <Image source={ClubLogo} className="w-6 h-6" resizeMode="contain" />
              </View>
              <View>
                <Text className="text-amber-500 font-black text-base tracking-wider">ROBOTECH</Text>
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  {user?.name} • <Text className="text-amber-500">{user?.role || 'Member'}</Text>
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => changeTab('settings')}
              className={`bg-slate-950 border p-2.5 rounded-xl ${
                activeTab === 'settings'
                  ? 'bg-amber-500/20 border-amber-500/60'
                  : 'border-amber-500/30'
              }`}
            >
              <Settings size={18} color={activeTab === 'settings' ? '#f59e0b' : '#94a3b8'} />
            </TouchableOpacity>
          </View>

          {/* Animated Tab Content */}
          <Animated.View className="flex-1" style={{ opacity: fadeAnim }}>
            {activeTab === 'feed' && <FeedView user={user} token={token} />}

            {activeTab === 'chat' && (
              <ChatView user={user} token={token} socket={socketRef.current} />
            )}

            {activeTab === 'calendar' && (
              <CalendarView user={user} token={token} />
            )}

            {activeTab === 'admin' && isAdmin && <AdminView token={token} />}

            {activeTab === 'settings' && (
              <ScrollView className="flex-1 p-5" keyboardShouldPersistTaps="handled">
                <Text className="text-amber-500 font-black text-xl mb-1 tracking-wider">ACCOUNT SETTINGS</Text>
                <Text className="text-slate-400 text-xs mb-6">Manage profile details and event check-ins</Text>

                {/* General Assembly Quick Check-In Card */}
                <View className="bg-slate-900 border border-amber-500/30 p-5 rounded-2xl mb-5 flex-row justify-between items-center shadow-lg shadow-amber-500/5">
                  <View className="flex-1 mr-3">
                    <Text className="text-white font-bold text-sm mb-1">General Assembly Check-In</Text>
                    <Text className="text-slate-400 text-xs">
                      Scan the host QR code at weekly meetings to mark your attendance.
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={openScannerModal}
                    className="bg-amber-500 p-3.5 rounded-xl flex-row items-center gap-1.5 active:scale-95"
                  >
                    <QrCode size={16} color="#0f172a" />
                    <Text className="text-slate-950 font-black text-xs uppercase tracking-wider">
                      Scan
                    </Text>
                  </TouchableOpacity>
                </View>

                {settingsMsg.text ? (
                  <View
                    className={`p-3.5 rounded-2xl mb-4 border flex-row items-center gap-2 ${
                      settingsMsg.type === 'error'
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-emerald-500/10 border-emerald-500/30'
                    }`}
                  >
                    <CheckCircle2 size={16} color={settingsMsg.type === 'error' ? '#fb7185' : '#34d399'} />
                    <Text
                      className={`text-xs font-bold ${
                        settingsMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {settingsMsg.text}
                    </Text>
                  </View>
                ) : null}

                <View className="bg-slate-900 p-5 rounded-2xl border border-slate-800 mb-5">
                  <View className="flex-row items-center gap-2 mb-4">
                    <User size={16} color="#f59e0b" />
                    <Text className="text-slate-200 font-bold text-xs uppercase tracking-wider">Profile Information</Text>
                  </View>

                  <Text className="text-slate-400 text-xs mb-1.5 font-medium">Display Name</Text>
                  <TextInput
                    value={updateName}
                    onChangeText={setUpdateName}
                    placeholder="Full Name"
                    placeholderTextColor="#475569"
                    className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium"
                  />

                  <Text className="text-slate-400 text-xs mb-1.5 font-medium">Email Address</Text>
                  <TextInput
                    value={user?.email}
                    editable={false}
                    className="bg-slate-950/50 text-slate-500 px-4 py-3.5 rounded-xl border border-slate-900 text-sm mb-2"
                  />
                </View>

                <View className="bg-slate-900 p-5 rounded-2xl border border-slate-800 mb-5">
                  <View className="flex-row items-center gap-2 mb-4">
                    <Lock size={16} color="#f59e0b" />
                    <Text className="text-slate-200 font-bold text-xs uppercase tracking-wider">Security & Credentials</Text>
                  </View>

                  <Text className="text-slate-400 text-xs mb-1.5 font-medium">Current Password</Text>
                  <TextInput
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    placeholder="Enter current password"
                    placeholderTextColor="#475569"
                    className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium"
                  />

                  <Text className="text-slate-400 text-xs mb-1.5 font-medium">New Password (Optional)</Text>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    placeholder="Leave empty to keep current password"
                    placeholderTextColor="#475569"
                    className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm font-medium"
                  />
                </View>

                <TouchableOpacity
                  onPress={handleUpdateProfile}
                  activeOpacity={0.8}
                  className="bg-amber-500 py-4 rounded-xl items-center mb-10 shadow-md shadow-amber-500/20"
                >
                  <Text className="text-slate-950 font-black text-xs uppercase tracking-widest">Save Changes</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animated.View>

          {/* Bottom Bar */}
          <View
            className="flex-row border-t border-slate-800/80 bg-slate-900 px-3 pt-3 gap-1.5"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <TouchableOpacity
              onPress={() => changeTab('feed')}
              activeOpacity={0.6}
              className={`flex-1 py-2.5 rounded-xl justify-center items-center flex-row gap-1.5 ${
                activeTab === 'feed'
                  ? 'bg-amber-500/15 border border-amber-500/40'
                  : 'bg-transparent'
              }`}
            >
              <LayoutGrid size={15} color={activeTab === 'feed' ? '#f59e0b' : '#64748b'} />
              <Text
                className={`font-bold text-[11px] tracking-wide ${
                  activeTab === 'feed' ? 'text-amber-500' : 'text-slate-400'
                }`}
              >
                Feed
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => changeTab('chat')}
              activeOpacity={0.6}
              className={`flex-1 py-2.5 rounded-xl justify-center items-center flex-row gap-1.5 ${
                activeTab === 'chat'
                  ? 'bg-amber-500/15 border border-amber-500/40'
                  : 'bg-transparent'
              }`}
            >
              <MessageSquare size={15} color={activeTab === 'chat' ? '#f59e0b' : '#64748b'} />
              <Text
                className={`font-bold text-[11px] tracking-wide ${
                  activeTab === 'chat' ? 'text-amber-500' : 'text-slate-400'
                }`}
              >
                Chat
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => changeTab('calendar')}
              activeOpacity={0.6}
              className={`flex-1 py-2.5 rounded-xl justify-center items-center flex-row gap-1.5 ${
                activeTab === 'calendar'
                  ? 'bg-amber-500/15 border border-amber-500/40'
                  : 'bg-transparent'
              }`}
            >
              <CalendarIcon size={15} color={activeTab === 'calendar' ? '#f59e0b' : '#64748b'} />
              <Text
                className={`font-bold text-[11px] tracking-wide ${
                  activeTab === 'calendar' ? 'text-amber-500' : 'text-slate-400'
                }`}
              >
                Events
              </Text>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity
                onPress={() => changeTab('admin')}
                activeOpacity={0.6}
                className={`flex-1 py-2.5 rounded-xl justify-center items-center flex-row gap-1.5 ${
                  activeTab === 'admin'
                    ? 'bg-amber-500/15 border border-amber-500/40'
                    : 'bg-transparent'
                }`}
              >
                <ShieldAlert size={15} color={activeTab === 'admin' ? '#f59e0b' : '#64748b'} />
                <Text
                  className={`font-bold text-[11px] tracking-wide ${
                    activeTab === 'admin' ? 'text-amber-500' : 'text-slate-400'
                  }`}
                >
                  Admin
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* General Assembly Attendance QR Scanner Modal */}
          <Modal
            visible={scannerVisible}
            animationType="slide"
            transparent={false}
            onRequestClose={closeScannerModal}
          >
            <SafeAreaView className="flex-1 bg-slate-950 justify-between">
              <View className="flex-row justify-between items-center p-5 border-b border-slate-800">
                <Text className="text-white font-black text-base tracking-wide">
                  📷 Scan Assembly Code
                </Text>
                <TouchableOpacity
                  onPress={closeScannerModal}
                  className="bg-slate-900 border border-slate-800 p-2 rounded-xl"
                >
                  <X size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <View className="flex-1 justify-center items-center overflow-hidden relative bg-black">
                {!permission ? (
                  <ActivityIndicator size="large" color="#f59e0b" />
                ) : !permission.granted ? (
                  <View className="p-6 items-center">
                    <Text className="text-slate-300 text-center mb-4 font-medium">
                      Camera permission is required to scan QR codes.
                    </Text>
                    <Button onPress={requestPermission} title="Grant Permission" color="#f59e0b" />
                  </View>
                ) : (
                  <>
                    <CameraView
                      style={StyleSheet.absoluteFillObject}
                      facing="back"
                      barcodeScannerSettings={{
                        barcodeTypes: ['qr'],
                      }}
                      onBarcodeScanned={handleBarcodeScanned}
                    />

                    {/* Camera Overlay Reticle */}
                    <View className="w-64 h-64 border-2 border-amber-500/80 rounded-3xl bg-amber-500/5 justify-center items-center">
                      <View className="w-56 h-56 border border-dashed border-amber-400/40 rounded-2xl" />
                    </View>
                  </>
                )}

                {isSubmittingCheckIn && (
                  <View className="absolute inset-0 bg-slate-950/80 justify-center items-center">
                    <ActivityIndicator size="large" color="#f59e0b" />
                    <Text className="text-amber-500 font-bold text-xs uppercase tracking-wider mt-3">
                      Registering Check-In...
                    </Text>
                  </View>
                )}
              </View>

              <View className="p-6 bg-slate-900 border-t border-slate-800">
                <Text className="text-slate-300 text-xs text-center font-medium">
                  Point camera directly at the Assembly host screen to verify your presence.
                </Text>
              </View>
            </SafeAreaView>
          </Modal>

          <SideMenu
            visible={sideMenuOpen}
            onClose={() => setSideMenuOpen(false)}
            user={user}
            onLogout={handleLogout}
            onSelectTab={(tab) => {
              changeTab(tab);
              setSideMenuOpen(false);
            }}
          />
        </SafeAreaView>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainAppContent />
    </SafeAreaProvider>
  );
}