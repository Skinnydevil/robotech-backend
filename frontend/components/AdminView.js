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