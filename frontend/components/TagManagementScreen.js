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
  Switch,
} from 'react-native';
import { Tag, Plus, Trash2, RefreshCw, Palette } from 'lucide-react-native';

const API_BASE_URL = 'https://robotech-backend-bc05.onrender.com/api';

const PRESET_COLORS = ['#f59e0b', '#34d399', '#60a5fa', '#f43f5e', '#a78bfa', '#fb923c'];

export default function TagManagementScreen({ token }) {
  const [tags, setTags] = useState([]);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#f59e0b');
  const [allowPublicCreation, setAllowPublicCreation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const fetchTagsAndSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error('Fetch tags non-JSON response:', rawText);
      }

      if (response.ok) {
        setTags(Array.isArray(data) ? data : data.tags || []);
      } else {
        Alert.alert('Error', data.error || data.message || `Failed to fetch tags (${response.status})`);
      }

      // Fetch tag policy/settings
      const settingsRes = await fetch(`${API_BASE_URL}/tags/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setAllowPublicCreation(!!settingsData.allowPublicCreation);
      }
    } catch (error) {
      console.error('Fetch Tags Error:', error);
      Alert.alert('Network Error', 'Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTagsAndSettings();
  }, []);

  const handleTogglePublicCreation = async (value) => {
    setAllowPublicCreation(value);
    setUpdatingSettings(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tags/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ allowPublicCreation: value }),
      });
      if (!response.ok) {
        Alert.alert('Error', 'Failed to update tag creation policy.');
        setAllowPublicCreation(!value); // Revert on failure
      }
    } catch (error) {
      Alert.alert('Network Error', 'Could not update tag settings.');
      setAllowPublicCreation(!value);
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleAddTag = async () => {
    const trimmedName = tagName.trim();
    if (!trimmedName) {
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
        body: JSON.stringify({ name: trimmedName, color: tagColor }),
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch (e) {}

      if (response.ok) {
        setTagName('');
        setTagColor('#f59e0b');
        fetchTagsAndSettings();
      } else {
        const errorMessage =
          data.error ||
          data.message ||
          (response.status === 400 ? 'Tag already exists or invalid name.' : `Server returned status ${response.status}`);
        Alert.alert('Error', errorMessage);
      }
    } catch (error) {
      Alert.alert('Network Error', 'Could not create tag.');
    } finally {
      setSubmitting(false);
    }
  };

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
                fetchTagsAndSettings();
              } else {
                const rawText = await response.text();
                let data = {};
                try {
                  data = JSON.parse(rawText);
                } catch (e) {}
                Alert.alert('Error', data.error || data.message || 'Failed to delete tag.');
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
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-amber-500 font-black text-xl tracking-wider uppercase">
            Tag Management
          </Text>
          <Text className="text-slate-400 text-xs">
            Create and organize tags, colors & permissions
          </Text>
        </View>

        <TouchableOpacity
          onPress={fetchTagsAndSettings}
          className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl"
        >
          <RefreshCw size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Admin Setting: Public Creation Toggle */}
      <View className="bg-slate-900 p-4 rounded-2xl border border-slate-800 mb-4 flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <Text className="text-white font-bold text-xs uppercase tracking-wider">Public Tag Creation</Text>
          <Text className="text-slate-400 text-[10px] mt-0.5">Allow standard members to create their own tags</Text>
        </View>
        <Switch
          value={allowPublicCreation}
          onValueChange={handleTogglePublicCreation}
          trackColor={{ false: '#334155', true: '#f59e0b' }}
          thumbColor="#ffffff"
        />
      </View>

      {/* Tag Input Form */}
      <View className="bg-slate-900 p-4 rounded-2xl border border-slate-800 mb-5">
        <TextInput
          placeholder="New tag name..."
          placeholderTextColor="#475569"
          value={tagName}
          onChangeText={setTagName}
          autoCapitalize="none"
          autoCorrect={false}
          className="bg-slate-950 text-white px-4 py-3 rounded-xl border border-slate-800 text-sm font-medium mb-3"
        />

        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-slate-400 text-xs font-semibold">Choose Tag Color:</Text>
          <View className="flex-row gap-2">
            {PRESET_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                onPress={() => setTagColor(color)}
                style={{ backgroundColor: color }}
                className={`w-6 h-6 rounded-full ${tagColor === color ? 'border-2 border-white' : ''}`}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity
          onResponse={handleAddTag}
          onPress={handleAddTag}
          disabled={submitting}
          activeOpacity={0.8}
          className="bg-amber-500 py-3.5 rounded-xl justify-center items-center flex-row gap-1"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <>
              <Plus size={18} color="#0f172a" />
              <Text className="text-slate-950 font-black text-xs uppercase">Create Tag</Text>
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
                <View 
                  style={{ backgroundColor: `${item.color || '#f59e0b'}20`, borderColor: `${item.color || '#f59e0b'}50` }} 
                  className="p-2 border rounded-lg"
                >
                  <Tag size={14} color={item.color || '#f59e0b'} />
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