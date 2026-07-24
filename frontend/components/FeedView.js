import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Heart,
  MessageCircle,
  Image as ImageIcon,
  Send,
  Trash2,
} from 'lucide-react-native';

const API_BASE_URL = 'https://robotech-backend-bc05.onrender.com/api';
const SERVER_HOST = 'https://robotech-backend-bc05.onrender.com';

export default function FeedView({ token, currentUser }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState(null);
  const [commentText, setCommentText] = useState('');

  const currentUserId = (
    currentUser?._id ||
    currentUser?.id ||
    currentUser?.user?._id ||
    currentUser?.user?.id
  )?.toString();

  const currentUserRole = currentUser?.role
    ? String(currentUser.role).toLowerCase()
    : currentUser?.user?.role
    ? String(currentUser.user.role).toLowerCase()
    : '';

  const isAdminOrBoard = currentUserRole === 'admin' || currentUserRole === 'board';

  const fetchPosts = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/posts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (response.ok) {
        setPosts(Array.isArray(data) ? data : data.posts || []);
      } else {
        Alert.alert('Error', data.error || data.message || 'Failed to load posts');
      }
    } catch (error) {
      console.error('Fetch posts error:', error);
      Alert.alert('Network Error', 'Unable to connect to server. Pull down to refresh if server was sleeping.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access media library is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleCreatePost = async () => {
    if (!postContent.trim() && !selectedImage) {
      Alert.alert('Validation Error', 'Please enter text or select an image');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('content', postContent);
      formData.append('authorName', currentUser?.name || currentUser?.user?.name || 'Member');

      if (selectedImage) {
        const filename = selectedImage.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';

        formData.append('media', {
          uri: selectedImage,
          name: filename,
          type,
        });
      }

      const response = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setPostContent('');
        setSelectedImage(null);
        fetchPosts();
      } else {
        Alert.alert('Error', data.error || data.message || 'Failed to create post');
      }
    } catch (error) {
      console.error('Create post error:', error);
      Alert.alert('Error', 'Network error while creating post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePost = (postId) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/posts/${postId}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (response.ok) {
                setPosts((prevPosts) => prevPosts.filter((p) => p._id !== postId));
              } else {
                const data = await response.json();
                Alert.alert('Error', data.error || 'Failed to delete post');
              }
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Network error deleting post');
            }
          },
        },
      ]
    );
  };

  const handleLikePost = async (postId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const updatedPost = await response.json();
      if (response.ok) {
        setPosts((prevPosts) =>
          prevPosts.map((p) => (p._id === postId ? updatedPost : p))
        );
      }
    } catch (error) {
      console.error('Like error:', error);
    }
  };

  const handleAddComment = async (postId) => {
    if (!commentText.trim()) return;

    try {
      const response = await fetch(`${API_BASE_URL}/posts/${postId}/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: commentText.trim(),
          authorName: currentUser?.name || currentUser?.user?.name || 'Member',
        }),
      });

      const updatedPost = await response.json();
      if (response.ok) {
        setPosts((prevPosts) =>
          prevPosts.map((p) => (p._id === postId ? updatedPost : p))
        );
        setCommentText('');
      } else {
        Alert.alert('Error', updatedPost.error || 'Could not post comment');
      }
    } catch (error) {
      console.error('Comment error:', error);
      Alert.alert('Error', 'Network error posting comment');
    }
  };

  const renderTagBadges = (tags) => {
    if (!tags || tags.length === 0) return null;
    return (
      <View className="flex-row flex-wrap gap-1 mt-1">
        {tags.map((tag, idx) => {
          const tagName = typeof tag === 'object' ? tag.name : 'Tag';
          const tagColor = typeof tag === 'object' && tag.color ? tag.color : '#3b82f6';
          return (
            <View
              key={tag._id || idx}
              style={{
                backgroundColor: `${tagColor}20`,
                borderColor: `${tagColor}80`,
              }}
              className="px-2 py-0.5 rounded border"
            >
              <Text style={{ color: tagColor }} className="text-[10px] font-bold">
                {tagName}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const getMediaUri = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${SERVER_HOST}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const renderPostItem = ({ item }) => {
    const isLiked = item.likes?.some(
      (likeId) => (typeof likeId === 'object' ? likeId._id : likeId)?.toString() === currentUserId
    );

    const authorName =
      (typeof item.author === 'object' && item.author?.name) ||
      item.authorName ||
      'Anonymous User';

    const authorAvatar = typeof item.author === 'object' ? item.author?.avatar : null;

    const authorId = (typeof item.author === 'object' ? item.author?._id || item.author?.id : item.author)?.toString();
    const canDelete = currentUserId && (authorId === currentUserId || isAdminOrBoard);
    const authorTags = typeof item.author === 'object' ? item.author?.tags || [] : [];

    return (
      <View className="bg-[#030712] border border-slate-800 rounded-2xl p-4 mb-4">
        {/* Header */}
        <View className="flex-row items-center mb-3">
          <View className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 justify-center items-center mr-3 overflow-hidden">
            {authorAvatar ? (
              <Image source={{ uri: getMediaUri(authorAvatar) }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <Text className="text-amber-500 font-bold text-sm">
                {authorName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-white font-bold text-sm">{authorName}</Text>
            {renderTagBadges(authorTags)}
          </View>
          <View className="items-end gap-1">
            <Text className="text-slate-500 text-[10px]">
              {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
            </Text>
            {canDelete && (
              <TouchableOpacity onPress={() => handleDeletePost(item._id)} className="p-1">
                <Trash2 size={16} color="#f43f5e" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content */}
        {item.content ? (
          <Text className="text-slate-200 text-sm mb-3 leading-5">{item.content}</Text>
        ) : null}

        {/* Media */}
        {item.mediaUrl ? (
          <Image
            source={{ uri: getMediaUri(item.mediaUrl) }}
            className="w-full h-56 rounded-xl mb-3"
            resizeMode="cover"
          />
        ) : null}

        {/* Actions */}
        <View className="flex-row items-center border-t border-slate-800/80 pt-3 mt-1">
          <TouchableOpacity
            onPress={() => handleLikePost(item._id)}
            className="flex-row items-center mr-6"
          >
            <Heart
              size={18}
              color={isLiked ? '#f43f5e' : '#94a3b8'}
              fill={isLiked ? '#f43f5e' : 'transparent'}
            />
            <Text className={`ml-1.5 text-xs ${isLiked ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
              {item.likes?.length || 0}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              setActiveCommentPostId(activeCommentPostId === item._id ? null : item._id)
            }
            className="flex-row items-center"
          >
            <MessageCircle size={18} color="#94a3b8" />
            <Text className="ml-1.5 text-xs text-slate-400">
              {item.comments?.length || 0}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Comments */}
        {activeCommentPostId === item._id && (
          <View className="mt-3 pt-3 border-t border-slate-800">
            {item.comments && item.comments.length > 0 ? (
              item.comments.map((comment, index) => (
                <View key={comment._id || index} className="bg-slate-900/60 p-2.5 rounded-lg mb-2 flex-row items-start gap-2">
                  <View className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 justify-center items-center overflow-hidden">
                    {comment.authorId?.avatar ? (
                      <Image source={{ uri: getMediaUri(comment.authorId.avatar) }} className="w-full h-full" />
                    ) : (
                      <Text className="text-amber-500 font-bold text-[10px]">
                        {(comment.authorName || 'M').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-amber-500 font-bold text-xs">
                      {comment.authorName || comment.authorId?.name || comment.user?.name || 'Member'}
                    </Text>
                    <Text className="text-slate-300 text-xs mt-0.5">{comment.text}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text className="text-slate-500 text-xs italic mb-2">No comments yet. Be the first!</Text>
            )}

            <View className="flex-row items-center mt-2 gap-2">
              <TextInput
                placeholder="Write a comment..."
                placeholderTextColor="#64748b"
                value={commentText}
                onChangeText={setCommentText}
                className="flex-1 bg-slate-900 text-white px-3 py-2 rounded-lg border border-slate-800 text-xs"
              />
              <TouchableOpacity
                onPress={() => handleAddComment(item._id)}
                className="bg-amber-500 p-2 rounded-lg"
              >
                <Send size={14} color="#030712" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#0a0f1d] justify-center items-center">
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#0a0f1d]"
    >
      <FlatList
        data={posts}
        keyExtractor={(item) => item._id}
        renderItem={renderPostItem}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />
        }
        ListHeaderComponent={
          <View className="bg-[#030712] border border-amber-500/30 p-4 rounded-2xl mb-6">
            <Text className="text-amber-500 font-bold text-base mb-3">Share an Update</Text>
            <TextInput
              placeholder="What's happening in your department?"
              placeholderTextColor="#64748b"
              value={postContent}
              onChangeText={setPostContent}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="bg-slate-900 text-white p-3 rounded-xl border border-slate-800 text-xs mb-3 min-h-[70px]"
            />

            {selectedImage && (
              <View className="relative mb-3">
                <Image source={{ uri: selectedImage }} className="w-full h-40 rounded-xl" />
                <TouchableOpacity
                  onPress={() => setSelectedImage(null)}
                  className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded-full"
                >
                  <Text className="text-white text-[10px] font-bold">Remove</Text>
                </TouchableOpacity>
              </View>
            )}

            <View className="flex-row justify-between items-center">
              <TouchableOpacity
                onPress={pickImage}
                className="flex-row items-center bg-slate-900 px-3 py-2 rounded-xl border border-slate-800"
              >
                <ImageIcon size={16} color="#f59e0b" />
                <Text className="text-slate-300 text-xs ml-2 font-medium">Add Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCreatePost}
                disabled={submitting}
                className="bg-amber-500 px-5 py-2.5 rounded-xl flex-row items-center"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#030712" />
                ) : (
                  <>
                    <Send size={14} color="#030712" />
                    <Text className="text-[#030712] font-bold text-xs ml-1.5 uppercase">Post</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}