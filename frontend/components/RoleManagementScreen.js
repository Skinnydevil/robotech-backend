import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RoleManagementScreen({ token, currentUserId, apiUrl }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // States for Search & Filter Options
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState(null); // Tag ID or null for 'All'
  
  // States for Tag Management Modal
  const [allTags, setAllTags] = useState([]);
  const [selectedUserForTags, setSelectedUserForTags] = useState(null);
  const [userSelectedTagIds, setUserSelectedTagIds] = useState([]);
  const [tagModalVisible, setTagModalVisible] = useState(false);

  const rawUrl = apiUrl || 'https://robotech-backend-bc05.onrender.com';
  const BASE_URL = rawUrl.replace(/\/+$/, '');

  useEffect(() => {
    fetchUsers();
    fetchAllTags();
  }, []);

  const fetchUsers = async () => {
    if (!token) {
      Alert.alert('Authentication Error', 'No active login token found.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/admin/users`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        Alert.alert('Server Error', `Server returned status ${response.status}.`);
        return;
      }

      const data = await response.json();
      if (response.ok) {
        setUsers(data);
      } else {
        Alert.alert('Error', data.error || 'Failed to load member list.');
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      Alert.alert('Network Error', 'Failed to connect to backend server.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllTags = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setAllTags(data);
      }
    } catch (err) {
      console.error('Failed to fetch tags list:', err);
    }
  };

  // Filtered Users computation using search query and tag selection
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // Name Search match
      const matchesName = user.name
        ? user.name.toLowerCase().includes(searchQuery.toLowerCase())
        : false;

      // Tag Filter match
      let matchesTag = true;
      if (selectedTagFilter) {
        matchesTag = user.tags?.some((tag) => {
          const tagId = typeof tag === 'object' ? tag._id : tag;
          return tagId === selectedTagFilter;
        });
      }

      return matchesName && matchesTag;
    });
  }, [users, searchQuery, selectedTagFilter]);

  const openTagModal = (user) => {
    setSelectedUserForTags(user);
    const existingIds = (user.tags || []).map((t) => (typeof t === 'object' ? t._id : t));
    setUserSelectedTagIds(existingIds);
    setTagModalVisible(true);
  };

  const toggleTagSelection = (tagId) => {
    setUserSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const saveUserTags = async () => {
    if (!selectedUserForTags) return;

    try {
      const response = await fetch(`${BASE_URL}/api/users/${selectedUserForTags._id}/tags`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tagIds: userSelectedTagIds }),
      });

      const data = await response.json();

      if (response.ok) {
        setUsers((prevUsers) =>
          prevUsers.map((u) => (u._id === selectedUserForTags._id ? data.user : u))
        );
        setTagModalVisible(false);
        Alert.alert('Success', 'User tags updated successfully!');
      } else {
        Alert.alert('Update Failed', data.error || 'Could not update tags.');
      }
    } catch (err) {
      console.error('Update tags error:', err);
      Alert.alert('Error', 'Failed to save tags.');
    }
  };

  const handleToggleRole = (user) => {
    if (user._id === currentUserId) {
      Alert.alert('Notice', 'You cannot change your own admin role.');
      return;
    }

    const newRole = user.role === 'admin' ? 'member' : 'admin';
    Alert.alert(
      'Confirm Role Change',
      `Change ${user.name}'s role to "${newRole.toUpperCase()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => updateRole(user._id, newRole) },
      ]
    );
  };

  const updateRole = async (userId, newRole) => {
    try {
      const response = await fetch(`${BASE_URL}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await response.json();
      if (response.ok) {
        setUsers((prevUsers) =>
          prevUsers.map((u) => (u._id === userId ? { ...u, role: newRole } : u))
        );
      } else {
        Alert.alert('Update Failed', data.error || 'Could not update role.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to update user role.');
    }
  };

  const handleDeleteUser = (user) => {
    if (user._id === currentUserId) {
      Alert.alert('Action Restricted', 'You cannot delete your own account.');
      return;
    }

    Alert.alert(
      'Delete User',
      `Permanently delete ${user.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteUser(user._id) },
      ]
    );
  };

  const deleteUser = async (userId) => {
    try {
      const response = await fetch(`${BASE_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setUsers((prevUsers) => prevUsers.filter((u) => u._id !== userId));
      } else {
        Alert.alert('Delete Failed', 'Could not delete user.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to delete user.');
    }
  };

  const renderUserItem = ({ item }) => {
    const isAdmin = item.role === 'admin';
    const isSelf = item._id === currentUserId;

    return (
      <View style={styles.card}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            {item.name} {isSelf && <Text style={styles.selfLabel}>(You)</Text>}
          </Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          
          {/* Render User Tags */}
          <View style={styles.tagChipsContainer}>
            {item.tags && item.tags.length > 0 ? (
              item.tags.map((tag, idx) => (
                <View key={idx} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{typeof tag === 'object' ? tag.name : 'Tag'}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noTagsText}>No tags assigned</Text>
            )}
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.tagButton} onPress={() => openTagModal(item)}>
            <Text style={styles.tagButtonText}>🏷️ Tags</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.badge, isAdmin ? styles.adminBadge : styles.memberBadge]}
            onPress={() => handleToggleRole(item)}
          >
            <Text style={[styles.badgeText, isAdmin ? styles.adminText : styles.memberText]}>
              {isAdmin ? '🛡️ Admin' : '👤 Member'}
            </Text>
          </TouchableOpacity>

          {!isSelf && (
            <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteUser(item)}>
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Role & Tag Management</Text>

      {/* Name Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor="#64748b"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Horizontal Tag Filters */}
      {allTags.length > 0 && (
        <View style={styles.filterWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContainer}>
            <TouchableOpacity
              style={[styles.filterChip, selectedTagFilter === null && styles.filterChipActive]}
              onPress={() => setSelectedTagFilter(null)}
            >
              <Text style={[styles.filterChipText, selectedTagFilter === null && styles.filterChipTextActive]}>
                All Tags
              </Text>
            </TouchableOpacity>

            {allTags.map((tag) => {
              const isActive = selectedTagFilter === tag._id;
              return (
                <TouchableOpacity
                  key={tag._id}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setSelectedTagFilter(isActive ? null : tag._id)}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {tag.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* User List */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item._id}
        renderItem={renderUserItem}
        contentContainerStyle={styles.listContainer}
        onRefresh={fetchUsers}
        refreshing={loading}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No users match the search criteria.</Text>
          </View>
        }
      />

      {/* Tag Assignment Modal */}
      <Modal visible={tagModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Assign Tags to {selectedUserForTags?.name}
            </Text>

            <ScrollView style={styles.modalScroll}>
              {allTags.length === 0 ? (
                <Text style={styles.noTagsText}>No tags found. Create some first!</Text>
              ) : (
                allTags.map((tag) => {
                  const isSelected = userSelectedTagIds.includes(tag._id);
                  return (
                    <TouchableOpacity
                      key={tag._id}
                      style={[styles.modalTagItem, isSelected && styles.modalTagSelected]}
                      onPress={() => toggleTagSelection(tag._id)}
                    >
                      <Text style={[styles.modalTagText, isSelected && styles.modalTagTextSelected]}>
                        {tag.name} {isSelected ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setTagModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={saveUserTags}
              >
                <Text style={styles.saveButtonText}>Save Tags</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1d' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0f1d' },
  headerTitle: { fontSize: 22, fontWeight: '700', marginHorizontal: 20, marginTop: 15, marginBottom: 10, color: '#f59e0b' },
  
  // Search Bar Styles
  searchContainer: { paddingHorizontal: 16, marginBottom: 10 },
  searchInput: {
    backgroundColor: '#030712',
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },

  // Filter Styles
  filterWrapper: { marginBottom: 12 },
  filterContainer: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#f59e0b',
  },
  filterChipText: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  filterChipTextActive: { color: '#f59e0b', fontWeight: '700' },

  // List & Cards
  listContainer: { paddingHorizontal: 16, paddingBottom: 20 },
  card: {
    backgroundColor: '#030712',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  userInfo: { flex: 1, marginRight: 8 },
  userName: { fontSize: 16, fontWeight: '600', color: '#f8fafc' },
  selfLabel: { fontSize: 12, color: '#f59e0b', fontWeight: 'normal' },
  userEmail: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  tagChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tagChip: { backgroundColor: 'rgba(59, 130, 246, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagChipText: { fontSize: 10, color: '#60a5fa' },
  noTagsText: { fontSize: 11, color: '#64748b', fontStyle: 'italic' },
  
  // Actions
  actionsContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagButton: { backgroundColor: 'rgba(59, 130, 246, 0.15)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  tagButtonText: { fontSize: 11, color: '#60a5fa', fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20 },
  adminBadge: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: '#f59e0b' },
  memberBadge: { backgroundColor: '#1e293b' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  adminText: { color: '#f59e0b' },
  memberText: { color: '#94a3b8' },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteButtonText: { fontSize: 12 },

  // Empty State
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#64748b', fontSize: 14, fontStyle: 'italic' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#030712', borderRadius: 16, padding: 20, maxHeight: '80%', borderWidth: 1, borderColor: '#f59e0b' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginBottom: 15 },
  modalScroll: { maxHeight: 300, marginBottom: 15 },
  modalTagItem: { padding: 12, borderRadius: 8, backgroundColor: '#1e293b', marginBottom: 8 },
  modalTagSelected: { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderWidth: 1, borderColor: '#f59e0b' },
  modalTagText: { color: '#94a3b8', fontSize: 14 },
  modalTagTextSelected: { color: '#f59e0b', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#1e293b' },
  cancelButtonText: { color: '#94a3b8', fontWeight: '600' },
  saveButton: { backgroundColor: '#f59e0b' },
  saveButtonText: { color: '#030712', fontWeight: '700' },
});