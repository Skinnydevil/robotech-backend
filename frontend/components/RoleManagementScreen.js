import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RoleManagementScreen({ token, currentUserId, apiUrl }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Strip any trailing slash from the base URL automatically
  const rawUrl = apiUrl || 'https://robotech-backend-bc05.onrender.com';
  const BASE_URL = rawUrl.replace(/\/+$/, '');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    if (!token) {
      Alert.alert('Authentication Error', 'No active login token found.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const endpoint = `${BASE_URL}/api/admin/users`;
      console.log('Fetching users from:', endpoint);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Safely check if Render/Express returned HTML instead of JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response received (Status ' + response.status + '):', text);
        Alert.alert(
          'Server Error',
          `Server returned status ${response.status}. Check your Render route path or server logs.`
        );
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setUsers(data);
      } else {
        Alert.alert('Error', data.error || data.message || 'Failed to load member list.');
      }
    } catch (err) {
      console.error('Fetch users error details:', err);
      Alert.alert('Network Error', 'Failed to connect to backend server. Make sure your Render instance is active.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRole = (user) => {
    // Prevent modifying self
    if (user._id === currentUserId) {
      Alert.alert('Notice', 'You cannot change your own admin role.');
      return;
    }

    const newRole = user.role === 'admin' ? 'member' : 'admin';

    Alert.alert(
      'Confirm Role Change',
      `Are you sure you want to change ${user.name}'s role to "${newRole.toUpperCase()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: newRole === 'admin' ? 'default' : 'destructive',
          onPress: () => updateRole(user._id, newRole),
        },
      ]
    );
  };

  const updateRole = async (userId, newRole) => {
    if (!token) {
      Alert.alert('Authentication Error', 'No active login token found.');
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON update response:', text);
        Alert.alert('Server Error', `Could not update role (Status ${response.status}).`);
        return;
      }

      const data = await response.json();

      if (response.ok) {
        // Update local state immediately
        setUsers((prevUsers) =>
          prevUsers.map((u) => (u._id === userId ? { ...u, role: newRole } : u))
        );
      } else {
        Alert.alert('Update Failed', data.error || data.message || 'Could not update role.');
      }
    } catch (err) {
      console.error('Update role error details:', err);
      Alert.alert('Error', 'Failed to update user role.');
    }
  };

  const renderUserItem = ({ item }) => {
    const isAdmin = item.role === 'admin';

    return (
      <View style={styles.card}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          {item.inscriptionNumber && (
            <Text style={styles.userSubText}>ID: {item.inscriptionNumber}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.badge, isAdmin ? styles.adminBadge : styles.memberBadge]}
          onPress={() => handleToggleRole(item)}
        >
          <Text style={[styles.badgeText, isAdmin ? styles.adminText : styles.memberText]}>
            {isAdmin ? '🛡️ Admin' : '👤 Member'}
          </Text>
        </TouchableOpacity>
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
      <Text style={styles.headerTitle}>Role Management</Text>
      <FlatList
        data={users}
        keyExtractor={(item) => item._id}
        renderItem={renderUserItem}
        contentContainerStyle={styles.listContainer}
        onRefresh={fetchUsers}
        refreshing={loading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1d' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0f1d' },
  headerTitle: { fontSize: 22, fontWeight: '700', marginHorizontal: 20, marginVertical: 15, color: '#f59e0b' },
  listContainer: { paddingHorizontal: 16 },
  card: {
    backgroundColor: '#030712',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#f8fafc' },
  userEmail: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  userSubText: { fontSize: 11, color: '#64748b', marginTop: 2 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  adminBadge: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: '#f59e0b' },
  memberBadge: { backgroundColor: '#1e293b' },
  badgeText: { fontSize: 13, fontWeight: '600' },
  adminText: { color: '#f59e0b' },
  memberText: { color: '#94a3b8' },
});