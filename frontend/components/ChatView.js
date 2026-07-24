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
  Image,
  Alert,
} from 'react-native';

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';
const SERVER_HOST = 'https://robotech-backend-bc05.onrender.com';

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

  // State for message actions modal on long press
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showMsgActionModal, setShowMsgActionModal] = useState(false);

  // State for conversation actions modal on long press
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showConvActionModal, setShowConvActionModal] = useState(false);

  const flatListRef = useRef(null);

  const getMediaUri = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${SERVER_HOST}${url.startsWith('/') ? '' : '/'}${url}`;
  };

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

  const updateConversationOrder = (convId, lastMessageText) => {
    setConversations((prevConvs) => {
      const index = prevConvs.findIndex((c) => c._id === convId);
      if (index === -1) {
        fetchConversations();
        return prevConvs;
      }
      
      const updatedConvs = [...prevConvs];
      const [movedConv] = updatedConvs.splice(index, 1);
      movedConv.lastMessage = lastMessageText;
      
      return [movedConv, ...updatedConvs];
    });
  };

  useEffect(() => {
    fetchConversations();
    if (socket && !socket.connected) {
      socket.connect();
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleGlobalNewMessage = (msg) => {
      const targetConvId = msg.conversationId;
      updateConversationOrder(targetConvId, msg.text);

      if (activeConv && targetConvId === activeConv._id) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;

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

    const handleMessageDeleted = ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    };

    socket.off('receive_private_message', handleGlobalNewMessage);
    socket.on('receive_private_message', handleGlobalNewMessage);

    socket.off('message_deleted', handleMessageDeleted);
    socket.on('message_deleted', handleMessageDeleted);

    return () => {
      socket.off('receive_private_message', handleGlobalNewMessage);
      socket.off('message_deleted', handleMessageDeleted);
    };
  }, [activeConv, socket]);

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

    return () => {
      socket.emit('leave_conversation', activeConv._id);
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
      senderAvatar: user.avatar,
      senderTags: user.tags || [],
      createdAt: new Date().toISOString(),
    };

    // Instantly move this chat to the top of your inbox list & update local conversations array reference
    setConversations((prevConvs) => {
      const index = prevConvs.findIndex((c) => c._id === activeConv._id);
      if (index === -1) return prevConvs;
      const updatedConvs = [...prevConvs];
      const [movedConv] = updatedConvs.splice(index, 1);
      movedConv.lastMessage = textToSend;
      return [movedConv, ...updatedConvs];
    });

    setMessages((prev) => [...prev, tempMessage]);
    setInputText('');

    socket.emit('send_private_message', {
      conversationId: activeConv._id,
      text: textToSend,
      senderId: user._id,
      senderName: user.name,
      senderAvatar: user.avatar,
      senderTags: user.tags || [],
    });
  };

  const handleDeleteMessage = async (msgId) => {
    try {
      const res = await fetch(`${API_URL}/messages/${msgId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setMessages((prev) => {
          const updatedMessages = prev.filter((m) => m._id !== msgId);
          // If conversation becomes empty after deletion, remove it from list
          if (updatedMessages.length === 0 && activeConv) {
            setConversations((convs) => convs.filter((c) => c._id !== activeConv._id));
          }
          return updatedMessages;
        });
        setShowMsgActionModal(false);
        setSelectedMessage(null);
      } else {
        Alert.alert('Error', 'Could not delete the message.');
      }
    } catch (err) {
      console.error('Failed deleting message:', err);
      Alert.alert('Error', 'Network request failed.');
    }
  };

  const handleDeleteConversation = async (convId) => {
    try {
      const res = await fetch(`${API_URL}/conversations/${convId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c._id !== convId));
        setShowConvActionModal(false);
        setSelectedConversation(null);
        if (activeConv && activeConv._id === convId) {
          setActiveConv(null);
        }
      } else {
        Alert.alert('Error', 'Could not delete the conversation.');
      }
    } catch (err) {
      console.error('Failed deleting conversation:', err);
      Alert.alert('Error', 'Network request failed.');
    }
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
        await fetchConversations();
        setActiveConv(newConv);
      }
    } catch (err) {
      console.error('Failed initiating conversation:', err);
    }
  };

  const getOtherUser = (conv) => {
    return conv.participants?.find((p) => (p._id || p)?.toString() !== user._id?.toString());
  };

  const renderTagBadges = (tags) => {
    if (!tags || tags.length === 0) return null;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
        {tags.map((tag, idx) => {
          const tagName = typeof tag === 'object' ? tag.name : 'Tag';
          const tagColor = typeof tag === 'object' && tag.color ? tag.color : '#3b82f6';
          return (
            <View
              key={idx}
              style={{
                backgroundColor: `${tagColor}25`,
                borderColor: `${tagColor}60`,
                borderWidth: 1,
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: tagColor, fontSize: 9, fontWeight: '700' }}>{tagName}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const getChatTitle = (conv) => {
    if (conv.isGroup) return `👥 ${conv.groupName}`;
    const otherUser = getOtherUser(conv);
    return `👤 ${otherUser?.name || 'Member'}`;
  };

  if (activeConv) {
    const otherUser = !activeConv.isGroup ? getOtherUser(activeConv) : null;
    const headerTags = otherUser?.tags || activeConv.otherUserTags || [];

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

          {!activeConv.isGroup && (
            <View className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 overflow-hidden mr-2 justify-center items-center">
              {otherUser?.avatar ? (
                <Image source={{ uri: getMediaUri(otherUser.avatar) }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <Text className="text-amber-500 font-bold text-xs">
                  {(otherUser?.name || 'M').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
          )}

          <View className="flex-1">
            <Text className="text-white font-bold text-base" numberOfLines={1}>
              {activeConv.isGroup ? `👥 ${activeConv.groupName}` : otherUser?.name || 'Member'}
            </Text>
            {!activeConv.isGroup && renderTagBadges(headerTags)}
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item._id}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const senderObj = typeof item.senderId === 'object' ? item.senderId : null;
            const senderIdStr = senderObj?._id?.toString() || item.senderId?.toString();
            const isMe = senderIdStr === user._id?.toString();
            const senderTags = item.senderTags || item.sender?.tags || [];
            const avatarUrl = item.senderAvatar || senderObj?.avatar;

            return (
              <View className={`mb-3 flex-row items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <View className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 overflow-hidden justify-center items-center">
                    {avatarUrl ? (
                      <Image source={{ uri: getMediaUri(avatarUrl) }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                      <Text className="text-amber-500 font-bold text-[10px]">
                        {(item.senderName || 'M').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                )}

                <View className={`flex-col shrink max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <View className="mb-1 px-1">
                      <Text className="text-slate-500 text-[10px] font-medium">
                        {item.senderName}
                      </Text>
                      {renderTagBadges(senderTags)}
                    </View>
                  )}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onLongPress={() => {
                      if (isMe && !item.isTemp) {
                        setSelectedMessage(item);
                        setShowMsgActionModal(true);
                      }
                    }}
                    className={`px-4 py-3 rounded-2xl ${
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
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />

        {/* Message Action Modal (Delete Option) */}
        <Modal visible={showMsgActionModal} animationType="fade" transparent>
          <View className="flex-1 bg-black/60 justify-center items-center p-6">
            <View className="bg-[#0b0f19] border border-slate-800 w-full max-w-xs rounded-2xl p-5 shadow-2xl">
              <Text className="text-white font-bold text-base mb-2 text-center">Message Options</Text>
              <Text className="text-slate-400 text-xs text-center mb-5" numberOfLines={2}>
                "{selectedMessage?.text}"
              </Text>

              <TouchableOpacity
                onPress={() => handleDeleteMessage(selectedMessage?._id)}
                className="bg-rose-500/20 border border-rose-500/50 py-3 rounded-xl mb-2 items-center active:scale-95"
              >
                <Text className="text-rose-400 font-bold text-xs uppercase tracking-wider">Delete Message</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowMsgActionModal(false);
                  setSelectedMessage(null);
                }}
                className="bg-slate-900 border border-slate-800 py-3 rounded-xl items-center active:scale-95"
              >
                <Text className="text-slate-300 font-bold text-xs uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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
        renderItem={({ item }) => {
          const otherUser = !item.isGroup ? getOtherUser(item) : null;
          const convTags = otherUser?.tags || item.otherUserTags || [];

          return (
            <TouchableOpacity
              onPress={() => setActiveConv(item)}
              onLongPress={() => {
                setSelectedConversation(item);
                setShowConvActionModal(true);
              }}
              className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-2xl mb-2.5 flex-row justify-between items-center shadow-md active:bg-slate-900"
            >
              <View className="flex-row items-center flex-1 mr-2">
                {!item.isGroup && (
                  <View className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 overflow-hidden mr-3 justify-center items-center">
                    {otherUser?.avatar ? (
                      <Image source={{ uri: getMediaUri(otherUser.avatar) }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                      <Text className="text-amber-500 font-bold text-sm">
                        {(otherUser?.name || 'M').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-white font-bold text-base">{getChatTitle(item)}</Text>
                  {!item.isGroup && renderTagBadges(convTags)}
                  <Text className="text-slate-400 text-xs mt-1 font-normal" numberOfLines={1}>
                    {item.lastMessage || 'No messages yet'}
                  </Text>
                </View>
              </View>
              <Text className="text-slate-600 text-xl font-bold">›</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Conversation Action Modal (Delete Conversation Option) */}
      <Modal visible={showConvActionModal} animationType="fade" transparent>
        <View className="flex-1 bg-black/60 justify-center items-center p-6">
          <View className="bg-[#0b0f19] border border-slate-800 w-full max-w-xs rounded-2xl p-5 shadow-2xl">
            <Text className="text-white font-bold text-base mb-2 text-center">Conversation Options</Text>
            <Text className="text-slate-400 text-xs text-center mb-5" numberOfLines={2}>
              {selectedConversation ? getChatTitle(selectedConversation) : ''}
            </Text>

            <TouchableOpacity
              onPress={() => handleDeleteConversation(selectedConversation?._id)}
              className="bg-rose-500/20 border border-rose-500/50 py-3 rounded-xl mb-2 items-center active:scale-95"
            >
              <Text className="text-rose-400 font-bold text-xs uppercase tracking-wider">Delete Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowConvActionModal(false);
                setSelectedConversation(null);
              }}
              className="bg-slate-900 border border-slate-800 py-3 rounded-xl items-center active:scale-95"
            >
              <Text className="text-slate-300 font-bold text-xs uppercase tracking-wider">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                  <View className="flex-row items-center flex-1 mr-2">
                    <View className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 overflow-hidden mr-2.5 justify-center items-center">
                      {item.avatar ? (
                        <Image source={{ uri: getMediaUri(item.avatar) }} className="w-full h-full" resizeMode="cover" />
                      ) : (
                        <Text className="text-amber-500 font-bold text-xs">
                          {(item.name || 'M').charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-white font-bold text-sm">{item.name}</Text>
                      <Text className="text-slate-400 text-xs">{item.email}</Text>
                      {renderTagBadges(item.tags)}
                    </View>
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