import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Tag, Plus, Trash2, RefreshCw } from 'lucide-react-native';

const API_BASE_URL = 'https://robotech-backend-bc05.onrender.com/api';

export default function TagManagementScreen({ token }) {
  const [tags, setTags] = useState([]);
  const [tagName, setTagName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch all tags from backend
  const fetchTags = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setTags(Array.isArray(data) ? data : data.tags || []);
      } else {
        Alert.alert('Error', data.error || 'Failed to fetch tags.');
      }
    } catch (error) {
      Alert.alert('Network Error', 'Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  // Add a new tag
  const handleAddTag = async () => {
    if (!tagName.trim()) {
      Alert.alert('Validation Error', 'Tag name cannot be empty.');
      return;
    }

    Keyboard.dismiss();
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: tagName.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setTagName('');
        fetchTags();
      } else {
        Alert.alert('Error', data.error || 'Failed to create tag.');
      }
    } catch (error) {
      Alert.alert('Network Error', 'Could not create tag.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete tag with confirmation
  const handleDeleteTag = (id, name) => {
    Alert.alert(
      'Delete Tag',
      `Are you sure you want to delete the tag "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/tags/${id}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (response.ok) {
                fetchTags();
              } else {
                const data = await response.json();
                Alert.alert('Error', data.error || 'Failed to delete tag.');
              }
            } catch (error) {
              Alert.alert('Network Error', 'Could not delete tag.');
            }
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-slate-950 p-5">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-amber-500 font-black text-xl tracking-wider uppercase">
            Tag Management
          </Text>
          <Text className="text-slate-400 text-xs">
            Create and organize tags for posts & members
          </Text>
        </View>

        <TouchableOpacity
          onPress={fetchTags}
          className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl"
        >
          <RefreshCw size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Tag Input Form */}
      <View className="bg-slate-900 p-4 rounded-2xl border border-slate-800 mb-5 flex-row items-center gap-2">
        <TextInput
          placeholder="New tag name..."
          placeholderTextColor="#475569"
          value={tagName}
          onChangeText={setTagName}
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 bg-slate-950 text-white px-4 py-3 rounded-xl border border-slate-800 text-sm font-medium"
        />

        <TouchableOpacity
          onPress={handleAddTag}
          disabled={submitting}
          activeOpacity={0.8}
          className="bg-amber-500 p-3.5 rounded-xl justify-center items-center flex-row gap-1"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <>
              <Plus size={18} color="#0f172a" />
              <Text className="text-slate-950 font-black text-xs uppercase">Add</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Tag List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#f59e0b" />
        </View>
      ) : (
        <FlatList
          data={tags}
          keyExtractor={(item) => item._id || item.id || String(Math.random())}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View className="items-center py-10 bg-slate-900/50 rounded-2xl border border-slate-900">
              <Tag size={32} color="#475569" />
              <Text className="text-slate-400 text-xs mt-2 font-medium">
                No tags found. Add one above!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl mb-2.5 flex-row justify-between items-center">
              <View className="flex-row items-center gap-2.5">
                <View className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <Tag size={14} color="#f59e0b" />
                </View>
                <Text className="text-slate-200 font-bold text-sm tracking-wide">
                  {item.name}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleDeleteTag(item._id || item.id, item.name)}
                className="bg-rose-500/10 border border-rose-500/30 p-2 rounded-lg"
              >
                <Trash2 size={16} color="#fb7185" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}