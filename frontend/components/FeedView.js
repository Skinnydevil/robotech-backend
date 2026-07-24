import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';

export default function FeedView({ user, token }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postText, setPostText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeCommentPostId, setActiveCommentPostId] = useState(null);
  const [commentText, setCommentText] = useState('');

  const currentUserId = user?._id || user?.id;

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/posts`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });

      if (res.ok) {
        const data = await res.json();
        setPosts(Array.isArray(data) ? data : []);
      } else {
        console.error('Failed fetching posts status:', res.status);
      }
    } catch (err) {
      console.error('Failed fetching posts error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchPosts();
    }
  }, [token]);

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access photo gallery is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0]);
    }
  };

  const handleCreatePost = async () => {
    if (!postText.trim() && !selectedImage) return;

    try {
      const formData = new FormData();
      formData.append('content', postText.trim());
      formData.append('authorName', user?.name || 'Member');
      formData.append('authorRole', user?.role || 'member');
      formData.append('category', 'General');
      
      // FIXED: Send the author ID so backend Mongoose schema properly links & populates user data
      if (currentUserId) {
        formData.append('author', currentUserId);
      }

      if (selectedImage) {
        const uriParts = selectedImage.uri.split('.');
        const fileType = uriParts[uriParts.length - 1] || 'jpeg';

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
      } else {
        const errData = await res.json();
        Alert.alert('Error', errData.error || 'Failed to publish post');
      }
    } catch (err) {
      console.error('Failed creating post:', err);
      Alert.alert('Error', 'Network error while creating post');
    }
  };

  const handleDeletePost = (postId) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/posts/${postId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });

              if (res.ok) {
                setPosts((prev) => prev.filter((p) => p._id !== postId));
              } else {
                const data = await res.json();
                Alert.alert('Error', data.error || 'Failed to delete post');
              }
            } catch (err) {
              console.error('Failed deleting post:', err);
              Alert.alert('Error', 'Unable to connect to server');
            }
          },
        },
      ]
    );
  };

  const handleToggleLike = async (postId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post._id === postId) {
          const likesList = post.likes || [];
          const hasLiked = likesList.includes(currentUserId);
          const newLikes = hasLiked
            ? likesList.filter((id) => id !== currentUserId)
            : [...likesList, currentUserId];
          return { ...post, likes: newLikes };
        }
        return post;
      })
    );

    try {
      const res = await fetch(`${API_URL}/posts/${postId}/like`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        fetchPosts();
      }
    } catch (err) {
      console.error('Failed toggling like:', err);
      fetchPosts();
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
        body: JSON.stringify({
          text: commentText.trim(),
          authorName: user?.name || 'Member',
        }),
      });
      if (res.ok) {
        setCommentText('');
        fetchPosts();
      }
    } catch (err) {
      console.error('Failed adding comment:', err);
    }
  };

  const resolveImageUrl = (mediaUrl) => {
    if (!mediaUrl) return null;
    if (mediaUrl.startsWith('http')) return mediaUrl;
    const serverBaseUrl = API_URL.replace('/api', '');
    return `${serverBaseUrl}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
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
              key={tag._id || idx}
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

  return (
    <View className="flex-1 p-4 bg-[#05070a]">
      <FlatList
        data={posts}
        keyExtractor={(item) => item._id || String(Math.random())}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={fetchPosts}
        ListEmptyComponent={
          !loading ? (
            <View className="py-12 items-center">
              <Text className="text-slate-400 font-medium text-sm">No posts found in feed.</Text>
            </View>
          ) : null
        }
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
                className="bg-slate-900 px-3.5 py-2 rounded-xl flex-row items-center gap-1.5 border border-slate-800 active:scale-95"
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
          const likesList = item.likes || [];
          const hasLiked = likesList.includes(currentUserId);
          const fullMediaUrl = resolveImageUrl(item.mediaUrl);

          const authorObj = typeof item.author === 'object' ? item.author : null;
          const authorName = authorObj?.name || item.authorName || 'Member';
          const authorRole = authorObj?.role || item.authorRole || 'builder';

          const isAuthor =
            (authorObj?._id && authorObj._id === currentUserId) ||
            item.authorName === user?.name ||
            item.authorId === currentUserId;
          const isAdmin = String(user?.role).toLowerCase() === 'admin';
          const canDelete = isAuthor || isAdmin;

          const authorTags = authorObj?.tags || item.authorTags || [];

          return (
            <View className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-3xl mb-3 shadow-lg">
              {/* Header */}
              <View className="flex-row justify-between items-start mb-2.5">
                <View className="flex-row items-start gap-2">
                  <View className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 justify-center items-center mt-0.5">
                    <Text className="text-xs font-bold text-amber-400">
                      {authorName[0]?.toUpperCase() || 'M'}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-white font-bold text-sm">{authorName}</Text>
                    <Text className="text-amber-500/80 text-[10px] uppercase font-semibold">
                      {authorRole}
                    </Text>

                    {renderTagBadges(authorTags)}
                  </View>
                </View>

                <View className="flex-row items-center gap-2">
                  <Text className="text-slate-500 text-[10px] font-medium">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recently'}
                  </Text>

                  {canDelete && (
                    <TouchableOpacity
                      onPress={() => handleDeletePost(item._id)}
                      className="bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg active:scale-95"
                    >
                      <Text className="text-rose-400 text-[11px] font-bold">🗑️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Content */}
              {item.content ? (
                <Text className="text-slate-200 text-sm mb-3 font-normal leading-relaxed">
                  {item.content}
                </Text>
              ) : null}

              {/* Media Image */}
              {fullMediaUrl && (
                <Image
                  source={{ uri: fullMediaUrl }}
                  className="w-full h-56 rounded-2xl mb-3 border border-slate-800/60"
                  resizeMode="cover"
                />
              )}

              {/* Actions */}
              <View className="flex-row gap-5 border-t border-slate-800/80 pt-3 items-center">
                <TouchableOpacity
                  onPress={() => handleToggleLike(item._id)}
                  className="flex-row items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800/50 active:scale-95"
                >
                  <Text className="text-xs">{hasLiked ? '❤️' : '🤍'}</Text>
                  <Text className="text-slate-300 text-xs font-bold">{likesList.length}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (activeCommentPostId === item._id) {
                      setActiveCommentPostId(null);
                    } else {
                      setActiveCommentPostId(item._id);
                      setCommentText('');
                    }
                  }}
                  className="flex-row items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800/50 active:scale-95"
                >
                  <Text className="text-xs">💬</Text>
                  <Text className="text-slate-300 text-xs font-bold">
                    {item.comments?.length || 0} Comments
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Comments Accordion */}
              {activeCommentPostId === item._id && (
                <View className="mt-3 pt-3 border-t border-slate-800/80">
                  {item.comments?.map((c, idx) => (
                    <View key={c._id || idx} className="bg-[#05070a] p-3 rounded-2xl mb-2 border border-slate-800/60">
                      <Text className="text-amber-400 font-bold text-[11px] mb-0.5">
                        {c.authorName || 'Member'}
                      </Text>
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
                      className="bg-amber-500 px-4 py-2 rounded-xl justify-center shadow-md shadow-amber-500/20 active:scale-95"
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