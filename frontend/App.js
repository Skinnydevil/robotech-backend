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
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import {
  Menu,
  Settings,
  LayoutGrid,
  MessageSquare,
  ShieldAlert,
  User,
  CheckCircle2,
  Calendar as CalendarIcon,
  QrCode,
  X,
  Lock,
  Tag,
  Plus,
} from 'lucide-react-native';

import AdminView from './components/AdminView';
import ChatView from './components/ChatView';
import FeedView from './components/FeedView';
import CalendarView from './components/CalendarView';
import SideMenu from './components/SideMenu';
import RoleManagementScreen from './components/RoleManagementScreen';
import TagManagementScreen from './components/TagManagementScreen';

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';
const SOCKET_URL = 'https://robotech-backend-bc05.onrender.com';
const ClubLogo = require('./assets/logo.png');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
  const [inscriptionNumber, setInscriptionNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(new Date(2002, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [authError, setAuthError] = useState('');

  // App Navigation & Drawer
  const [activeTab, setActiveTab] = useState('feed');
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  // Profile Settings State
  const [updateName, setUpdateName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [settingsMsg, setSettingsMsg] = useState({ type: '', text: '' });

  // Tag Selection & Creation State for Members
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [isPublicTagAllowed, setIsPublicTagAllowed] = useState(false);
  const [newCustomTagName, setNewCustomTagName] = useState('');
  const [newCustomTagColor, setNewCustomTagColor] = useState('#f59e0b');

  // Assembly Check-In Scanner State
  const [scannerVisible, setScannerVisible] = useState(false);
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const socketRef = useRef(null);
  const activeTabRef = useRef(activeTab);
  const isScanningRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const triggerTestNotification = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🤖 ROBOTECH Test Alert',
          body: 'Local notifications are configured and working correctly!',
          sound: 'default',
          data: { test: 'data' },
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Error triggering notification:', error);
      Alert.alert('Error', 'Could not fire notification. Check console logs.');
    }
  };

  useEffect(() => {
    const registerForPushNotifications = async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default Channel',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#f59e0b',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return;
      } catch (err) {
        console.error('Failed to configure notifications:', err);
      }
    };

    registerForPushNotifications();
  }, []);

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
          setSelectedTags(parsedUser.tags || []);
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
    const fetchMemberTagsAndSettings = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/tags`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableTags(Array.isArray(data) ? data : data.tags || []);
        }
        const settingsRes = await fetch(`${API_URL}/tags/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setIsPublicTagAllowed(!!settingsData.allowPublicCreation);
        }
      } catch (e) {
        console.error('Error loading tags/settings config:', e);
      }
    };
    fetchMemberTagsAndSettings();
  }, [token]);

  useEffect(() => {
    if (token) {
      socketRef.current = io(SOCKET_URL, {
        autoConnect: true,
        auth: { token },
      });

      socketRef.current.on('receive_message', async (msg) => {
        if (msg?.sender?._id === user?._id || msg?.sender === user?._id) return;
        if (activeTabRef.current === 'chat') return;

        const senderName = msg?.sender?.name || (typeof msg?.sender === 'string' ? 'Club Member' : 'New Message');
        const messageBody = msg?.content || msg?.text || msg?.message || (msg?.mediaUrl ? '📷 Sent an attachment' : 'Sent you a message.');

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `💬 ${senderName}`,
            body: String(messageBody),
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
            data: { type: 'chat', messageId: msg?._id },
          },
          trigger: null,
        });
      });

      socketRef.current.on('event_created', async (eventData) => {
        const eventTitle = eventData?.title || 'New Event Added';
        const eventDate = eventData?.date ? new Date(eventData.date).toLocaleDateString() : '';

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '📅 New Calendar Event',
            body: `"${eventTitle}" has been added to the schedule ${eventDate ? `for ${eventDate}` : ''}.`,
            data: { type: 'calendar' },
          },
          trigger: null,
        });
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off('receive_message');
        socketRef.current.off('event_created');
        socketRef.current.disconnect();
      }
    };
  }, [token, user]);

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setDateOfBirth(selectedDate);
  };

  const handleAuth = async () => {
    Keyboard.dismiss();
    setAuthError('');

    if (!email.trim() || !password) {
      setAuthError('Please fill in all required fields.');
      return;
    }

    if (!isLogin && (!name.trim() || !inscriptionNumber.trim())) {
      setAuthError('Please fill in full name and inscription number.');
      return;
    }

    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    const payload = isLogin
      ? { email: email.trim(), password }
      : {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          inscriptionNumber: inscriptionNumber.trim(),
          dateOfBirth: dateOfBirth.toISOString(),
        };

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
        setSelectedTags(data.user.tags || []);
      } else {
        setIsLogin(true);
        setName('');
        setEmail('');
        setPassword('');
        setInscriptionNumber('');
        setAuthError('Registration submitted! Awaiting admin approval.');
      }
    } catch (err) {
      setAuthError('Network connection error. Check your backend status.');
    }
  };

  const handleToggleMemberTag = (tagName) => {
    let updated;
    if (selectedTags.includes(tagName)) {
      updated = selectedTags.filter((t) => t !== tagName);
    } else {
      updated = [...selectedTags, tagName];
    }
    setSelectedTags(updated);
  };

  const handleCreateCustomTag = async () => {
    const trimmed = newCustomTagName.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`${API_URL}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed, color: newCustomTagColor }),
      });
      const data = await res.json();
      if (res.ok) {
        const createdTag = data.tag || data;
        setAvailableTags((prev) => [...prev, createdTag]);
        setSelectedTags((prev) => [...prev, createdTag.name]);
        setNewCustomTagName('');
      } else {
        Alert.alert('Error', data.error || 'Could not create tag.');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error creating tag.');
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
          tags: selectedTags,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSettingsMsg({ type: 'error', text: data.error || 'Update failed' });
        return;
      }

      const updatedUser = { ...user, name: updateName, tags: selectedTags };
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      setCurrentPassword('');
      setNewPassword('');
      setSettingsMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setSettingsMsg({ type: 'error', text: 'Failed to update profile.' });
    }
  };

  const handleBarcodeScanned = async ({ data: rawData }) => {
    if (!permission?.granted || isSubmittingCheckIn || isScanningRef.current) return;

    isScanningRef.current = true;
    setIsSubmittingCheckIn(true);

    try {
      let sessionId = null;
      if (rawData.startsWith('{')) {
        try {
          sessionId = JSON.parse(rawData).sessionId || rawData;
        } catch (e) {
          sessionId = rawData.trim();
        }
      } else if (rawData.includes('sessionId=')) {
        sessionId = rawData.match(/sessionId=([^&]+)/)?.[1];
      } else if (rawData.includes('robotech://checkin')) {
        sessionId = new URLSearchParams(rawData.split('?')[1]).get('sessionId');
      } else {
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
          { text: 'Try Again', onPress: () => { isScanningRef.current = false; } },
        ]);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to connect to check-in server.', [
        { text: 'OK', onPress: () => { isScanningRef.current = false; } },
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
      if (socketRef.current) socketRef.current.disconnect();
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

  const isAdmin = user?.role === 'admin' || user?.role === 'Admin' || user?.role === 'Board';

  return (
    <View className="flex-1 bg-slate-950">
      {!token ? (
        <SafeAreaView className="flex-1 bg-slate-950">
          <StatusBar barStyle="light-content" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled" className="p-6 bg-slate-950">
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

                {!isLogin && (
                  <>
                    <TextInput
                      placeholder="Inscription Number (e.g. 2300123)"
                      placeholderTextColor="#475569"
                      value={inscriptionNumber}
                      onChangeText={setInscriptionNumber}
                      keyboardType="numeric"
                      className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium"
                    />

                    <TouchableOpacity
                      onPress={() => setShowDatePicker(true)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 mb-3 flex-row items-center justify-between"
                    >
                      <Text className="text-slate-400 text-sm font-medium">
                        Date of Birth: <Text className="text-white">{dateOfBirth.toLocaleDateString()}</Text>
                      </Text>
                      <CalendarIcon size={16} color="#f59e0b" />
                    </TouchableOpacity>

                    {showDatePicker && (
                      <DateTimePicker
                        value={dateOfBirth}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleDateChange}
                        maximumDate={new Date()}
                      />
                    )}
                  </>
                )}

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
        <SafeAreaView className="flex-1 bg-slate-950" edges={['top', 'left', 'right']}>
          <StatusBar barStyle="light-content" />

          {/* Top Header */}
          <View className="flex-row justify-between items-center px-5 py-3.5 border-b border-slate-800/80 bg-slate-900">
            <View className="flex-row items-center gap-3">
              <TouchableOpacity onPress={() => setSideMenuOpen(true)} className="bg-slate-950 border border-amber-500/30 p-2.5 rounded-xl">
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
                activeTab === 'settings' ? 'bg-amber-500/20 border-amber-500/60' : 'border-amber-500/30'
              }`}
            >
              <Settings size={18} color={activeTab === 'settings' ? '#f59e0b' : '#94a3b8'} />
            </TouchableOpacity>
          </View>

          {/* Tab Views */}
          <Animated.View className="flex-1" style={{ opacity: fadeAnim }}>
            {activeTab === 'feed' && <FeedView user={user} token={token} />}
            {activeTab === 'chat' && <ChatView user={user} token={token} socket={socketRef.current} />}
            {activeTab === 'calendar' && <CalendarView user={user} token={token} />}
            {activeTab === 'roles' && isAdmin && <RoleManagementScreen token={token} currentUserId={user?._id} />}
            {activeTab === 'tags' && isAdmin && <TagManagementScreen token={token} />}
            {activeTab === 'admin' && isAdmin && <AdminView token={token} />}

            {activeTab === 'settings' && (
              <ScrollView className="flex-1 p-5" keyboardShouldPersistTaps="handled">
                <Text className="text-amber-500 font-black text-xl mb-1 tracking-wider">ACCOUNT SETTINGS</Text>
                <Text className="text-slate-400 text-xs mb-6">Manage profile details and event check-ins</Text>

                <View className="bg-slate-900 border border-amber-500/30 p-5 rounded-2xl mb-5 flex-row justify-between items-center shadow-lg shadow-amber-500/5">
                  <View className="flex-1 mr-3">
                    <Text className="text-white font-bold text-sm mb-1">General Assembly Check-In</Text>
                    <Text className="text-slate-400 text-xs">Scan the host QR code at weekly meetings to mark your attendance.</Text>
                  </View>

                  <TouchableOpacity onPress={openScannerModal} className="bg-amber-500 p-3.5 rounded-xl flex-row items-center gap-1.5 active:scale-95">
                    <QrCode size={16} color="#0f172a" />
                    <Text className="text-slate-950 font-black text-xs uppercase tracking-wider">Scan</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={triggerTestNotification} activeOpacity={0.8} className="bg-amber-500/20 border border-amber-500/50 p-4 rounded-xl items-center my-4">
                  <Text className="text-amber-500 font-bold text-xs uppercase tracking-wider">🔔 Trigger Test Notification</Text>
                </TouchableOpacity>

                {settingsMsg.text ? (
                  <View className={`p-3.5 rounded-2xl mb-4 border flex-row items-center gap-2 ${settingsMsg.type === 'error' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                    <CheckCircle2 size={16} color={settingsMsg.type === 'error' ? '#fb7185' : '#34d399'} />
                    <Text className={`text-xs font-bold ${settingsMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>{settingsMsg.text}</Text>
                  </View>
                ) : null}

                <View className="bg-slate-900 p-5 rounded-2xl border border-slate-800 mb-5">
                  <View className="flex-row items-center gap-2 mb-4">
                    <User size={16} color="#f59e0b" />
                    <Text className="text-slate-200 font-bold text-xs uppercase tracking-wider">Profile Information</Text>
                  </View>

                  <Text className="text-slate-400 text-xs mb-1.5 font-medium">Display Name</Text>
                  <TextInput value={updateName} onChangeText={setUpdateName} placeholder="Full Name" placeholderTextColor="#475569" className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium" />

                  <Text className="text-slate-400 text-xs mb-1.5 font-medium">Email Address</Text>
                  <TextInput value={user?.email} editable={false} className="bg-slate-950/50 text-slate-500 px-4 py-3.5 rounded-xl border border-slate-900 text-sm mb-3" />

                  {user?.inscriptionNumber && (
                    <>
                      <Text className="text-slate-400 text-xs mb-1.5 font-medium">Inscription Number</Text>
                      <TextInput value={user?.inscriptionNumber} editable={false} className="bg-slate-950/50 text-slate-500 px-4 py-3.5 rounded-xl border border-slate-900 text-sm mb-2" />
                    </>
                  )}
                </View>

                {/* Member Tag Selection / Custom Creation Box */}
                <View className="bg-slate-900 p-5 rounded-2xl border border-slate-800 mb-5">
                  <View className="flex-row items-center gap-2 mb-3">
                    <Tag size={16} color="#f59e0b" />
                    <Text className="text-slate-200 font-bold text-xs uppercase tracking-wider">My Tags & Specializations</Text>
                  </View>
                  <Text className="text-slate-400 text-xs mb-3">Select available tags or add custom tags below.</Text>

                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {availableTags.map((t) => {
                      const isSelected = selectedTags.includes(t.name);
                      return (
                        <TouchableOpacity
                          key={t._id || t.name}
                          onPress={() => handleToggleMemberTag(t.name)}
                          style={{
                            backgroundColor: isSelected ? `${t.color || '#f59e0b'}30` : '#0f172a',
                            borderColor: isSelected ? (t.color || '#f59e0b') : '#334155',
                          }}
                          className="border px-3 py-2 rounded-xl flex-row items-center gap-1.5"
                        >
                          <Tag size={12} color={t.color || '#f59e0b'} />
                          <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                            {t.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {isPublicTagAllowed && (
                    <View className="border-t border-slate-800 pt-3 mt-2">
                      <Text className="text-slate-300 font-bold text-xs mb-2">Create Custom Tag</Text>
                      <TextInput
                        placeholder="Custom tag name..."
                        placeholderTextColor="#475569"
                        value={newCustomTagName}
                        onChangeText={setNewCustomTagName}
                        className="bg-slate-950 text-white px-3 py-2.5 rounded-xl border border-slate-800 text-xs mb-2 font-medium"
                      />
                      <TouchableOpacity
                        onPress={handleCreateCustomTag}
                        className="bg-amber-500/20 border border-amber-500/50 py-2.5 rounded-xl items-center flex-row justify-center gap-1"
                      >
                        <Plus size={14} color="#f59e0b" />
                        <Text className="text-amber-500 font-bold text-xs uppercase">Add Custom Tag</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View className="bg-slate-900 p-5 rounded-2xl border border-slate-800 mb-5">
                  <View className="flex-row items-center gap-2 mb-4">
                    <Lock size={16} color="#f59e0b" />
                    <Text className="text-slate-200 font-bold text-xs uppercase tracking-wider">Security & Credentials</Text>
                  </View>

                  <Text className="text-slate-400 text-xs mb-1.5 font-medium">Current Password</Text>
                  <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Enter current password" placeholderTextColor="#475569" className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-3 font-medium" />

                  <Text className="text-slate-400 text-xs mb-1.5 font-medium">New Password (Optional)</Text>
                  <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Leave empty to keep current password" placeholderTextColor="#475569" className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm font-medium" />
                </View>

                <TouchableOpacity onPress={handleUpdateProfile} activeOpacity={0.8} className="bg-amber-500 py-4 rounded-xl items-center mb-10 shadow-md shadow-amber-500/20">
                  <Text className="text-slate-950 font-black text-xs uppercase tracking-widest">Save Changes</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animated.View>

          {/* Bottom Bar */}
          <View className="flex-row border-t border-slate-800/80 bg-slate-900 px-3 pt-3 gap-1" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
            <TouchableOpacity onPress={() => changeTab('feed')} activeOpacity={0.6} className={`flex-1 py-2 rounded-xl justify-center items-center flex-row gap-1 ${activeTab === 'feed' ? 'bg-amber-500/15 border border-amber-500/40' : ''}`}>
              <LayoutGrid size={14} color={activeTab === 'feed' ? '#f59e0b' : '#64748b'} />
              <Text className={`font-bold text-[10px] ${activeTab === 'feed' ? 'text-amber-500' : 'text-slate-400'}`}>Feed</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => changeTab('chat')} activeOpacity={0.6} className={`flex-1 py-2 rounded-xl justify-center items-center flex-row gap-1 ${activeTab === 'chat' ? 'bg-amber-500/15 border border-amber-500/40' : ''}`}>
              <MessageSquare size={14} color={activeTab === 'chat' ? '#f59e0b' : '#64748b'} />
              <Text className={`font-bold text-[10px] ${activeTab === 'chat' ? 'text-amber-500' : 'text-slate-400'}`}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => changeTab('calendar')} activeOpacity={0.6} className={`flex-1 py-2 rounded-xl justify-center items-center flex-row gap-1 ${activeTab === 'calendar' ? 'bg-amber-500/15 border border-amber-500/40' : ''}`}>
              <CalendarIcon size={14} color={activeTab === 'calendar' ? '#f59e0b' : '#64748b'} />
              <Text className={`font-bold text-[10px] ${activeTab === 'calendar' ? 'text-amber-500' : 'text-slate-400'}`}>Events</Text>
            </TouchableOpacity>

            {isAdmin && (
              <>
                <TouchableOpacity onPress={() => changeTab('admin')} activeOpacity={0.6} className={`flex-1 py-2 rounded-xl justify-center items-center flex-row gap-1 ${activeTab === 'admin' ? 'bg-amber-500/15 border border-amber-500/40' : ''}`}>
                  <ShieldAlert size={14} color={activeTab === 'admin' ? '#f59e0b' : '#64748b'} />
                  <Text className={`font-bold text-[10px] ${activeTab === 'admin' ? 'text-amber-500' : 'text-slate-400'}`}>Admin</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => changeTab('roles')} activeOpacity={0.6} className={`flex-1 py-2 rounded-xl justify-center items-center flex-row gap-1 ${activeTab === 'roles' ? 'bg-amber-500/15 border border-amber-500/40' : ''}`}>
                  <User size={14} color={activeTab === 'roles' ? '#f59e0b' : '#64748b'} />
                  <Text className={`font-bold text-[10px] ${activeTab === 'roles' ? 'text-amber-500' : 'text-slate-400'}`}>Roles</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => changeTab('tags')} activeOpacity={0.6} className={`flex-1 py-2 rounded-xl justify-center items-center flex-row gap-1 ${activeTab === 'tags' ? 'bg-amber-500/15 border border-amber-500/40' : ''}`}>
                  <Tag size={14} color={activeTab === 'tags' ? '#f59e0b' : '#64748b'} />
                  <Text className={`font-bold text-[10px] ${activeTab === 'tags' ? 'text-amber-500' : 'text-slate-400'}`}>Tags</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* General Assembly Attendance QR Scanner Modal */}
          <Modal visible={scannerVisible} animationType="slide" transparent={false} onRequestClose={closeScannerModal}>
            <SafeAreaView className="flex-1 bg-slate-950 justify-between">
              <View className="flex-row justify-between items-center p-5 border-b border-slate-800">
                <Text className="text-white font-black text-base tracking-wide">📷 Scan Assembly Code</Text>
                <TouchableOpacity onPress={closeScannerModal} className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                  <X size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <View className="flex-1 justify-center items-center overflow-hidden relative bg-black">
                {!permission ? (
                  <ActivityIndicator size="large" color="#f59e0b" />
                ) : !permission.granted ? (
                  <View className="p-6 items-center">
                    <Text className="text-slate-300 text-center mb-4 font-medium">Camera permission is required to scan QR codes.</Text>
                    <Button onPress={requestPermission} title="Grant Permission" color="#f59e0b" />
                  </View>
                ) : (
                  <>
                    <CameraView style={StyleSheet.absoluteFillObject} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={handleBarcodeScanned} />
                    <View className="w-64 h-64 border-2 border-amber-500/80 rounded-3xl bg-amber-500/5 justify-center items-center">
                      <View className="w-56 h-56 border border-dashed border-amber-400/40 rounded-2xl" />
                    </View>
                  </>
                )}

                {isSubmittingCheckIn && (
                  <View className="absolute inset-0 bg-slate-950/80 justify-center items-center">
                    <ActivityIndicator size="large" color="#f59e0b" />
                    <Text className="text-amber-500 font-bold text-xs uppercase tracking-wider mt-3">Registering Check-In...</Text>
                  </View>
                )}
              </View>

              <View className="p-6 bg-slate-900 border-t border-slate-800">
                <Text className="text-slate-300 text-xs text-center font-medium">Point camera directly at the Assembly host screen to verify your presence.</Text>
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