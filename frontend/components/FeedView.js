import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';

export default function FeedView({ user, token }) {
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
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
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
          const hasLiked = post.likes?.includes(user._id);
          const newLikes = hasLiked
            ? post.likes.filter((id) => id !== user._id)
            : [...(post.likes || []), user._id];
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

  // Helper component/function to render tag badges nicely
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

  return (
    <View className="flex-1 p-4 bg-[#05070a]">
      <FlatList
        data={posts}
        keyExtractor={(item) => item._id}
        showsVerticalScrollIndicator={false}
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
          const hasLiked = item.likes?.includes(user?._id);
          const fullMediaUrl = resolveImageUrl(item.mediaUrl);
          
          const isAuthor = item.authorName === user?.name || item.authorId === user?._id;
          const isAdmin = user?.role === 'admin';
          const canDelete = isAuthor || isAdmin;

          // Pull user tags from populated author object (fallback to item.authorTags if structured differently)
          const authorTags = item.author?.tags || item.authorTags || [];

          return (
            <View className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-3xl mb-3 shadow-lg">
              {/* Header */}
              <View className="flex-row justify-between items-start mb-2.5">
                <View className="flex-row items-start gap-2">
                  <View className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 justify-center items-center mt-0.5">
                    <Text className="text-xs font-bold text-amber-400">
                      {item.authorName?.[0]?.toUpperCase() || 'M'}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-white font-bold text-sm">{item.authorName || 'Member'}</Text>
                    <Text className="text-amber-500/80 text-[10px] uppercase font-semibold">
                      {item.authorRole || 'builder'}
                    </Text>
                    
                    {/* Render Tags under Author Name */}
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
                  <Text className="text-slate-300 text-xs font-bold">{item.likes?.length || 0}</Text>
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