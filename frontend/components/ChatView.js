import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';

export default function ChatView({ user, token, socket }) {
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
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed fetching conversations:', err);
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await fetch(`${API_URL}/users/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (err) {
      console.error('Failed fetching members:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
    if (socket && !socket.connected) {
      socket.connect();
    }
  }, []);

  // Socket room handling & message listeners
  useEffect(() => {
    if (!activeConv || !socket) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_URL}/conversations/${activeConv._id}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed fetching messages:', err);
      }
    };

    fetchMessages();
    socket.emit('join_conversation', activeConv._id);

    const handleNewMessage = (msg) => {
      if (msg.conversationId === activeConv._id) {
        setMessages((prev) => {
          // Check if message already exists by real backend ID
          if (prev.some((m) => m._id === msg._id)) return prev;

          // Replace temporary optimistic message if matching text & sender
          const tempIndex = prev.findIndex(
            (m) => m.isTemp && m.senderId === msg.senderId && m.text === msg.text
          );

          if (tempIndex !== -1) {
            const updated = [...prev];
            updated[tempIndex] = msg;
            return updated;
          }

          return [...prev, msg];
        });
      }
    };

    socket.off('receive_private_message', handleNewMessage);
    socket.on('receive_private_message', handleNewMessage);

    return () => {
      socket.emit('leave_conversation', activeConv._id);
      socket.off('receive_private_message', handleNewMessage);
    };
  }, [activeConv, socket]);

  const handleSendMessage = () => {
    if (!inputText.trim() || !activeConv || !socket) return;

    const textToSend = inputText.trim();
    const tempId = `temp-${Date.now()}`;

    const tempMessage = {
      _id: tempId,
      isTemp: true,
      conversationId: activeConv._id,
      text: textToSend,
      senderId: user._id,
      senderName: user.name,
      createdAt: new Date().toISOString(),
    };

    // Add temporary message for instant UI responsiveness
    setMessages((prev) => [...prev, tempMessage]);
    setInputText('');

    socket.emit('send_private_message', {
      conversationId: activeConv._id,
      text: textToSend,
      senderId: user._id,
      senderName: user.name,
    });
  };

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
            className="mr-3 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800 active:scale-95"
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
          keyExtractor={(item) => item._id}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMe = item.senderId?.toString() === user._id?.toString();

            return (
              <View className={`mb-3 flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <Text className="text-slate-500 text-[10px] mb-1 font-medium px-1">
                    {item.senderName}
                  </Text>
                )}
                <View
                  className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                    isMe
                      ? 'bg-amber-500 rounded-br-none shadow-md shadow-amber-500/10'
                      : 'bg-[#0b0f19] border border-slate-800/80 rounded-bl-none shadow-md'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      isMe ? 'text-slate-950 font-semibold' : 'text-slate-200 font-normal'
                    }`}
                  >
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
          <Text className="text-slate-950 font-black text-xs uppercase tracking-wider">
            + New Chat
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={
          <View className="p-12 items-center justify-center">
            <Text className="text-slate-500 text-sm text-center font-medium">
              No active chats found. Start a new conversation above!
            </Text>
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
            <TouchableOpacity
              onPress={() => setShowModal(false)}
              className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800"
            >
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