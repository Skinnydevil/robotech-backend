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

// ============================================================================
// 1. ACTIVITY FEED COMPONENT
// ============================================================================
function FeedView({ user, token }) {
  const [posts, setPosts] = useState([]);
  const [postText, setPostText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeCommentPostId, setActiveCommentPostId] = useState(null);
  const [commentText, setCommentText] = useState('');

  const fetchPosts = async () => {
    try {
      const res = await fetch(`${API_URL}/posts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPosts(await res.json());
    } catch (err) {
      console.error('Failed fetching posts:', err);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
    }
  };

  const handleCreatePost = async () => {
    if (!postText.trim() && !selectedImage) return;

    try {
      const formData = new FormData();
      formData.append('content', postText.trim());
      formData.append('authorName', user.name);
      formData.append('authorRole', user.role || 'member');
      formData.append('category', 'General');

      if (selectedImage) {
        const uriParts = selectedImage.uri.split('.');
        const fileType = uriParts[uriParts.length - 1];

        formData.append('media', {
          uri: selectedImage.uri,
          name: `photo.${fileType}`,
          type: `image/${fileType}`,
        });
      }

      const res = await fetch(`${API_URL}/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.ok) {
        setPostText('');
        setSelectedImage(null);
        fetchPosts();
      }
    } catch (err) {
      console.error('Failed creating post:', err);
    }
  };

  const handleToggleLike = async (postId) => {
    try {
      const res = await fetch(`${API_URL}/posts/${postId}/like`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchPosts();
    } catch (err) {
      console.error('Failed toggling like:', err);
    }
  };

  const handleAddComment = async (postId) => {
    if (!commentText.trim()) return;
    try {
      const res = await fetch(`${API_URL}/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: commentText.trim() }),
      });
      if (res.ok) {
        setCommentText('');
        fetchPosts();
      }
    } catch (err) {
      console.error('Failed adding comment:', err);
    }
  };

  return (
    <View className="flex-1 p-4 bg-[#05070a]">
      <FlatList
        data={posts}
        keyExtractor={(item) => item._id}
        ListHeaderComponent={
          <View className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-3xl mb-4 shadow-xl">
            <TextInput
              placeholder="Share a build update or project note..."
              placeholderTextColor="#64748b"
              multiline
              value={postText}
              onChangeText={setPostText}
              className="text-white text-sm min-h-[70px] mb-3 font-medium"
            />

            {selectedImage && (
              <View className="mb-3 relative">
                <Image
                  source={{ uri: selectedImage.uri }}
                  className="w-full h-44 rounded-2xl"
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => setSelectedImage(null)}
                  className="absolute top-3 right-3 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800"
                >
                  <Text className="text-rose-400 font-bold text-xs">Remove</Text>
                </TouchableOpacity>
              </View>
            )}

            <View className="flex-row justify-between items-center border-t border-slate-800/80 pt-3">
              <TouchableOpacity
                onPress={handlePickImage}
                className="bg-slate-900 px-3.5 py-2 rounded-xl flex-row items-center gap-1.5 border border-slate-800"
              >
                <Text className="text-xs">📷</Text>
                <Text className="text-slate-300 font-bold text-xs">Add Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCreatePost}
                className="bg-amber-500 py-2.5 px-5 rounded-xl active:scale-95 shadow-md shadow-amber-500/20"
              >
                <Text className="text-slate-950 font-black text-xs uppercase tracking-wider">Post</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const hasLiked = item.likes?.includes(user._id);
          const serverBaseUrl = API_URL.replace('/api', '');

          return (
            <View className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-3xl mb-3 shadow-lg">
              <View className="flex-row justify-between items-center mb-2.5">
                <View className="flex-row items-center gap-2">
                  <View className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 justify-center items-center">
                    <Text className="text-xs font-bold text-amber-400">{item.authorName?.[0] || 'B'}</Text>
                  </View>
                  <View>
                    <Text className="text-white font-bold text-sm">{item.authorName || 'Member'}</Text>
                    <Text className="text-amber-500/80 text-[10px] uppercase font-semibold">{item.authorRole || 'builder'}</Text>
                  </View>
                </View>
                <Text className="text-slate-500 text-[10px] font-medium">
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>

              {item.content ? <Text className="text-slate-200 text-sm mb-3 font-normal leading-relaxed">{item.content}</Text> : null}

              {item.mediaUrl && item.mediaType === 'image' && (
                <Image
                  source={{ uri: `${serverBaseUrl}${item.mediaUrl}` }}
                  className="w-full h-56 rounded-2xl mb-3 border border-slate-800/60"
                  resizeMode="cover"
                />
              )}

              <View className="flex-row gap-5 border-t border-slate-800/80 pt-3 items-center">
                <TouchableOpacity
                  onPress={() => handleToggleLike(item._id)}
                  className="flex-row items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800/50"
                >
                  <Text className="text-xs">{hasLiked ? '❤️' : '🤍'}</Text>
                  <Text className="text-slate-300 text-xs font-bold">{item.likes?.length || 0}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    setActiveCommentPostId(activeCommentPostId === item._id ? null : item._id)
                  }
                  className="flex-row items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800/50"
                >
                  <Text className="text-xs">💬</Text>
                  <Text className="text-slate-300 text-xs font-bold">
                    {item.comments?.length || 0} Comments
                  </Text>
                </TouchableOpacity>
              </View>

              {activeCommentPostId === item._id && (
                <View className="mt-3 pt-3 border-t border-slate-800/80">
                  {item.comments?.map((c, idx) => (
                    <View key={idx} className="bg-[#05070a] p-3 rounded-2xl mb-2 border border-slate-800/60">
                      <Text className="text-amber-400 font-bold text-[11px] mb-0.5">{c.authorName}</Text>
                      <Text className="text-slate-300 text-xs">{c.text}</Text>
                    </View>
                  ))}

                  <View className="flex-row gap-2 mt-2">
                    <TextInput
                      placeholder="Write a comment..."
                      placeholderTextColor="#64748b"
                      value={commentText}
                      onChangeText={setCommentText}
                      className="flex-1 bg-[#05070a] text-white px-3.5 py-2 rounded-xl border border-slate-800 text-xs font-medium"
                    />
                    <TouchableOpacity
                      onPress={() => handleAddComment(item._id)}
                      className="bg-amber-500 px-4 py-2 rounded-xl justify-center shadow-md shadow-amber-500/20"
                    >
                      <Text className="text-slate-950 font-black text-[10px] uppercase">Reply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

// ============================================================================
// 2. CHAT COMPONENT
// ============================================================================
function ChatView({ user, token }) {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');

  const [members, setMembers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const flatListRef = useRef(null);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConversations(await res.json());
    } catch (err) {
      console.error('Failed fetching conversations:', err);
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await fetch(`${API_URL}/users/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMembers(await res.json());
    } catch (err) {
      console.error('Failed fetching members:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!activeConv) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_URL}/conversations/${activeConv._id}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setMessages(await res.json());
      } catch (err) {
        console.error('Failed fetching messages:', err);
      }
    };

    fetchMessages();
    socket.emit('join_conversation', activeConv._id);

    const handleNewMessage = (msg) => {
      if (msg.conversationId === activeConv._id) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    socket.on('receive_private_message', handleNewMessage);

    return () => {
      socket.emit('leave_conversation', activeConv._id);
      socket.off('receive_private_message', handleNewMessage);
    };
  }, [activeConv]);

  const handleStartChat = async (recipientId = null) => {
    const body = isCreatingGroup
      ? { isGroup: true, groupName, participantIds: selectedMemberIds }
      : { isGroup: false, recipientId };

    try {
      const res = await fetch(`${API_URL}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const newConv = await res.json();
        setShowModal(false);
        setSelectedMemberIds([]);
        setGroupName('');
        fetchConversations();
        setActiveConv(newConv);
      }
    } catch (err) {
      console.error('Failed initiating conversation:', err);
    }
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || !activeConv) return;

    socket.emit('send_private_message', {
      conversationId: activeConv._id,
      text: inputText.trim(),
      senderId: user._id,
      senderName: user.name,
    });

    setInputText('');
  };

  const getChatTitle = (conv) => {
    if (conv.isGroup) return `👥 ${conv.groupName}`;
    const otherUser = conv.participants?.find((p) => p._id !== user._id);
    return `👤 ${otherUser?.name || 'Member'}`;
  };

  if (activeConv) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-[#05070a] p-4"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <View className="flex-row items-center border-b border-slate-800/80 pb-3 mb-3 bg-[#0b0f19] -mx-4 px-4 pt-1 shadow-sm">
          <TouchableOpacity
            onPress={() => {
              setActiveConv(null);
              fetchConversations();
            }}
            className="mr-3 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800"
          >
            <Text className="text-amber-400 font-bold text-xs">← Inbox</Text>
          </TouchableOpacity>
          <Text className="text-white font-bold text-base flex-1" numberOfLines={1}>
            {getChatTitle(activeConv)}
          </Text>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item._id || String(Math.random())}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMe = item.senderId?.toString() === user._id?.toString();

            return (
              <View className={`mb-3 flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && <Text className="text-slate-500 text-[10px] mb-1 font-medium">{item.senderName}</Text>}
                <View
                  className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                    isMe
                      ? 'bg-amber-500 rounded-br-none shadow-md shadow-amber-500/10'
                      : 'bg-[#0b0f19] border border-slate-800/80 rounded-bl-none shadow-md'
                  }`}
                >
                  <Text className={`text-sm ${isMe ? 'text-slate-950 font-semibold' : 'text-slate-200 font-normal'}`}>
                    {item.text}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View className="flex-row gap-2 mt-2 pt-3 border-t border-slate-800/80">
          <TextInput
            placeholder="Type a message..."
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            className="flex-1 bg-[#0b0f19] text-white px-4 py-3.5 rounded-2xl border border-slate-800 text-sm font-medium"
          />
          <TouchableOpacity
            onPress={handleSendMessage}
            className="bg-amber-500 px-5 rounded-2xl justify-center items-center active:scale-95 shadow-md shadow-amber-500/20"
          >
            <Text className="text-slate-950 font-black text-xs uppercase">Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View className="flex-1 bg-[#05070a] p-4">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-white font-black text-lg tracking-wide">💬 Channels & DMs</Text>
        <TouchableOpacity
          onPress={() => {
            fetchMembers();
            setShowModal(true);
          }}
          className="bg-amber-500 px-3.5 py-2 rounded-xl active:scale-95 shadow-md shadow-amber-500/20"
        >
          <Text className="text-slate-950 font-black text-xs uppercase tracking-wider">+ New Chat</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={
          <View className="p-12 items-center justify-center">
            <Text className="text-slate-500 text-sm text-center font-medium">No active chats found. Start a new conversation above!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setActiveConv(item)}
            className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-2xl mb-2.5 flex-row justify-between items-center shadow-md active:bg-slate-900"
          >
            <View className="flex-1 mr-2">
              <Text className="text-white font-bold text-base">{getChatTitle(item)}</Text>
              <Text className="text-slate-400 text-xs mt-1 font-normal" numberOfLines={1}>
                {item.lastMessage || 'No messages yet'}
              </Text>
            </View>
            <Text className="text-slate-600 text-xl font-bold">›</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <SafeAreaView className="flex-1 bg-[#05070a] p-4">
          <View className="flex-row justify-between items-center mb-4 pb-3 border-b border-slate-800/80">
            <Text className="text-white font-bold text-base">
              {isCreatingGroup ? 'Create Group Channel' : 'Start Direct Message'}
            </Text>
            <TouchableOpacity onPress={() => setShowModal(false)} className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <Text className="text-rose-400 font-bold text-xs">Cancel</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-2 mb-4">
            <TouchableOpacity
              onPress={() => setIsCreatingGroup(false)}
              className={`flex-1 py-2.5 rounded-xl border ${
                !isCreatingGroup ? 'bg-amber-500/20 border-amber-500/80' : 'bg-[#0b0f19] border-slate-800'
              }`}
            >
              <Text
                className={`text-center font-bold text-xs ${
                  !isCreatingGroup ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                1-on-1 Direct
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsCreatingGroup(true)}
              className={`flex-1 py-2.5 rounded-xl border ${
                isCreatingGroup ? 'bg-amber-500/20 border-amber-500/80' : 'bg-[#0b0f19] border-slate-800'
              }`}
            >
              <Text
                className={`text-center font-bold text-xs ${
                  isCreatingGroup ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                Group Channel
              </Text>
            </TouchableOpacity>
          </View>

          {isCreatingGroup && (
            <TextInput
              placeholder="Group Title (e.g. Mechanical Team)"
              placeholderTextColor="#64748b"
              value={groupName}
              onChangeText={setGroupName}
              className="bg-[#0b0f19] text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-4 font-medium"
            />
          )}

          <FlatList
            data={members}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => {
              const isSelected = selectedMemberIds.includes(item._id);

              return (
                <TouchableOpacity
                  onPress={() => {
                    if (isCreatingGroup) {
                      setSelectedMemberIds((prev) =>
                        isSelected ? prev.filter((id) => id !== item._id) : [...prev, item._id]
                      );
                    } else {
                      handleStartChat(item._id);
                    }
                  }}
                  className={`p-3.5 rounded-2xl border mb-2.5 flex-row justify-between items-center ${
                    isSelected ? 'bg-amber-500/20 border-amber-500/80' : 'bg-[#0b0f19] border-slate-800/80'
                  }`}
                >
                  <View>
                    <Text className="text-white font-bold text-sm">{item.name}</Text>
                    <Text className="text-slate-400 text-xs">{item.email}</Text>
                  </View>
                  {!isCreatingGroup && <Text className="text-amber-400 font-bold text-xs">Message →</Text>}
                  {isCreatingGroup && <Text className="text-base">{isSelected ? '✅' : '⚪'}</Text>}
                </TouchableOpacity>
              );
            }}
          />

          {isCreatingGroup && (
            <TouchableOpacity
              onPress={() => handleStartChat()}
              disabled={!groupName.trim() || selectedMemberIds.length === 0}
              className={`p-4 rounded-2xl mt-3 shadow-lg ${
                groupName.trim() && selectedMemberIds.length > 0 ? 'bg-amber-500 shadow-amber-500/20' : 'bg-slate-800'
              }`}
            >
              <Text className="text-slate-950 font-black text-center text-xs uppercase tracking-wider">
                Launch Group Channel
              </Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ============================================================================
// 3. ADMIN PANEL & APPROVAL TAB COMPONENT
// ============================================================================
function AdminView({ token }) {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const fetchPendingUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch(`${API_URL}/admin/pending-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingUsers(data);
      }
    } catch (err) {
      console.error('Failed fetching pending users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const handleApproveUser = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/admin/approve-user/${userId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchPendingUsers();
      }
    } catch (err) {
      console.error('Failed approving user:', err);
    }
  };

  // NEW: Function to delete/reject pending user
  const handleRejectUser = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/admin/reject-user/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchPendingUsers(); // Refresh list after deleting
      }
    } catch (err) {
      console.error('Failed rejecting user:', err);
    }
  };

  return (
    <View className="flex-1 bg-[#05070a] p-4">
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-white font-black text-lg tracking-wide">🛡️ Admin Dashboard</Text>
          <Text className="text-slate-400 text-xs mt-0.5">Manage new member requests & clearances</Text>
        </View>
        <TouchableOpacity
          onPress={fetchPendingUsers}
          className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800"
        >
          <Text className="text-amber-400 font-bold text-xs">Refresh</Text>
        </TouchableOpacity>
      </View>

      {loadingUsers ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="small" color="#f59e0b" />
        </View>
      ) : (
        <FlatList
          data={pendingUsers}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={
            <View className="p-16 items-center justify-center">
              <Text className="text-4xl mb-2">🎉</Text>
              <Text className="text-slate-400 text-sm font-semibold text-center">No pending user approvals</Text>
              <Text className="text-slate-600 text-xs mt-1 text-center">All registered builders have been cleared.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-2xl mb-3 flex-row justify-between items-center shadow-md">
              <View className="flex-1 mr-3">
                <Text className="text-white font-bold text-base">{item.name}</Text>
                <Text className="text-slate-400 text-xs mt-0.5">{item.email}</Text>
                <Text className="text-amber-500/80 text-[10px] mt-1 uppercase font-semibold">
                  Registered: {new Date(item.createdAt || Date.now()).toLocaleDateString()}
                </Text>
              </View>

              {/* Action Buttons Container */}
              <View className="flex-row items-center gap-2">
                {/* Reject/Delete Button */}
                <TouchableOpacity
                  onPress={() => handleRejectUser(item._id)}
                  className="bg-rose-950/40 border border-rose-800/50 px-3 py-2.5 rounded-xl active:scale-95"
                >
                  <Text className="text-rose-400 font-bold text-xs uppercase">Reject</Text>
                </TouchableOpacity>

                {/* Approve Button */}
                <TouchableOpacity
                  onPress={() => handleApproveUser(item._id)}
                  className="bg-amber-500 px-3 py-2.5 rounded-xl active:scale-95 shadow-md shadow-amber-500/20"
                >
                  <Text className="text-slate-950 font-black text-xs uppercase tracking-wider">Approve</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}