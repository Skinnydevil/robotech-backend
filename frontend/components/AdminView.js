import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  QrCode,
  Users,
  RefreshCw,
  UserCheck,
  Share2,
  Download,
  Power,
  ShieldAlert,
} from 'lucide-react-native';
import { exportAttendanceCSV, shareQRCode } from '../fileShareHelper'; // Adjust import path if needed

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';

export default function AdminView({ token }) {
  const [activeAdminTab, setActiveAdminTab] = useState('approvals');

  // --- USER APPROVAL STATES ---
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // --- GENERAL ASSEMBLY STATES ---
  const [assemblyName, setAssemblyName] = useState('');
  const [activeAssembly, setActiveAssembly] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [loadingAssembly, setLoadingAssembly] = useState(false);

  const qrRef = useRef(null);

  // 1. FETCH PENDING USER APPROVALS
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

  // 2. FETCH ACTIVE ASSEMBLY SESSION
  const checkActiveAssembly = async () => {
    try {
      const res = await fetch(`${API_URL}/assembly/session/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.status === 'active' || data.isActive)) {
          setActiveAssembly(data);
        } else {
          setActiveAssembly(null);
        }
      }
    } catch (err) {
      console.error('Error fetching active session state:', err);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
    checkActiveAssembly();
  }, [token]);

  // Handle Approve User
  const handleApproveUser = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/admin/approve-user/${userId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPendingUsers((prev) => prev.filter((user) => user._id !== userId));
      } else {
        Alert.alert('Error', 'Failed to approve user.');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error while approving user.');
    }
  };

  // Handle Reject User
  const handleRejectUser = (userId, userName) => {
    Alert.alert(
      'Reject Registration',
      `Are you sure you want to reject ${userName || 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/admin/reject-user/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                setPendingUsers((prev) => prev.filter((user) => user._id !== userId));
              }
            } catch (err) {
              Alert.alert('Error', 'Network error while rejecting user.');
            }
          },
        },
      ]
    );
  };

  // Start Assembly
  const handleStartAssembly = async () => {
    if (!assemblyName.trim()) {
      Alert.alert('Required', 'Please enter an assembly topic or title.');
      return;
    }

    setLoadingAssembly(true);
    try {
      const res = await fetch(`${API_URL}/admin/assembly/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: assemblyName.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setActiveAssembly(data.assembly || data);
        setAttendees([]);
        setAssemblyName('');
      } else {
        Alert.alert('Error', data.error || 'Failed to start assembly.');
      }
    } catch (err) {
      Alert.alert('Error', 'Network connection issue starting assembly.');
    } finally {
      setLoadingAssembly(false);
    }
  };

  // End Assembly Session
  const handleCloseAssembly = () => {
    Alert.alert(
      'Close Assembly Session',
      'Are you sure you want to end this session? Members will no longer be able to scan and check in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Session',
          style: 'destructive',
          onPress: async () => {
            const targetId = activeAssembly?._id || activeAssembly?.sessionId || activeAssembly?.id;

            if (!targetId) {
              Alert.alert('Error', 'Session ID not found.');
              return;
            }

            try {
              // Primary Attempt: PUT request to /close endpoint
              let res = await fetch(`${API_URL}/admin/assembly/${targetId}/close`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
              });

              // Fallback Attempt: POST request to /stop endpoint if /close route is not matched
              if (!res.ok && res.status === 404) {
                res = await fetch(`${API_URL}/admin/assembly/${targetId}/stop`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                });
              }

              if (res.ok) {
                setActiveAssembly(null);
                setAttendees([]);
                Alert.alert('Session Ended', 'Assembly check-in session has been closed.');
              } else {
                const data = await res.json().catch(() => ({}));
                Alert.alert('Error', data.error || 'Failed to close assembly session on server.');
              }
            } catch (err) {
              Alert.alert('Error', 'Network error closing session.');
            }
          },
        },
      ]
    );
  };

  // Fetch Attendees
  const fetchAttendees = async () => {
    const targetId = activeAssembly?._id || activeAssembly?.sessionId || activeAssembly?.id;
    if (!targetId) return;

    try {
      const res = await fetch(`${API_URL}/admin/assembly/${targetId}/attendees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setAttendees(data.attendees || []);
      }
    } catch (err) {
      console.error('Error fetching attendees:', err);
    }
  };

  useEffect(() => {
    let interval;
    if (activeAssembly) {
      fetchAttendees();
      interval = setInterval(fetchAttendees, 5000);
    }
    return () => clearInterval(interval);
  }, [activeAssembly]);

  // Handle Share QR
  const handleShareQR = () => {
    if (!qrRef.current) {
      Alert.alert('Error', 'QR code element is loading.');
      return;
    }
    qrRef.current.toDataURL((dataUrl) => {
      shareQRCode(dataUrl, activeAssembly?.title);
    });
  };

  return (
    <View className="flex-1 bg-[#05070a] p-4">
      {/* Sub Navigation Bar */}
      <View className="flex-row bg-slate-900/80 p-1 rounded-xl mb-4 border border-slate-800">
        <TouchableOpacity
          onPress={() => setActiveAdminTab('approvals')}
          className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-2 ${
            activeAdminTab === 'approvals' ? 'bg-amber-500' : 'bg-transparent'
          }`}
        >
          <UserCheck size={14} color={activeAdminTab === 'approvals' ? '#0f172a' : '#94a3b8'} />
          <Text
            className={`font-black text-xs uppercase tracking-wider ${
              activeAdminTab === 'approvals' ? 'text-slate-950' : 'text-slate-400'
            }`}
          >
            Approvals ({pendingUsers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveAdminTab('assembly')}
          className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-2 ${
            activeAdminTab === 'assembly' ? 'bg-amber-500' : 'bg-transparent'
          }`}
        >
          <QrCode size={14} color={activeAdminTab === 'assembly' ? '#0f172a' : '#94a3b8'} />
          <Text
            className={`font-black text-xs uppercase tracking-wider ${
              activeAdminTab === 'assembly' ? 'text-slate-950' : 'text-slate-400'
            }`}
          >
            Assembly QR
          </Text>
        </TouchableOpacity>
      </View>

      {/* --- TAB 1: PENDING APPROVALS --- */}
      {activeAdminTab === 'approvals' && (
        <View className="flex-1">
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-white font-black text-lg tracking-wide">🛡️ Member Clearances</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Approve new registration accounts</Text>
            </View>
            <TouchableOpacity
              onPress={fetchPendingUsers}
              className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800 active:scale-95"
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
                  <Text className="text-slate-400 text-sm font-semibold text-center">
                    No pending user approvals
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-2xl mb-3 flex-row justify-between items-center shadow-md">
                  <View className="flex-1 mr-3">
                    <Text className="text-white font-bold text-base">{item.name}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">{item.email}</Text>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={() => handleRejectUser(item._id, item.name)}
                      className="bg-rose-950/40 border border-rose-800/50 px-3 py-2.5 rounded-xl active:scale-95"
                    >
                      <Text className="text-rose-400 font-bold text-xs uppercase">Reject</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleApproveUser(item._id)}
                      className="bg-amber-500 px-3 py-2.5 rounded-xl active:scale-95"
                    >
                      <Text className="text-slate-950 font-black text-xs uppercase tracking-wider">
                        Approve
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* --- TAB 2: GENERAL ASSEMBLY --- */}
      {activeAdminTab === 'assembly' && (
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <Text className="text-white font-black text-lg tracking-wide mb-0.5">⚡ General Assembly Host</Text>
          <Text className="text-slate-400 text-xs mb-4">Generate check-in QR codes for member attendance</Text>

          {!activeAssembly ? (
            <View className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800">
              <Text className="text-slate-200 font-bold text-sm mb-2">Start Assembly Session</Text>

              <TextInput
                placeholder="Session Name (e.g. GA #4 - Weekly Build Review)"
                placeholderTextColor="#475569"
                value={assemblyName}
                onChangeText={setAssemblyName}
                className="bg-slate-950 text-white px-4 py-3.5 rounded-xl border border-slate-800 text-sm mb-4 font-medium"
              />

              <TouchableOpacity
                onPress={handleStartAssembly}
                disabled={loadingAssembly}
                className="bg-amber-500 py-3.5 rounded-xl items-center flex-row justify-center gap-2 active:scale-95"
              >
                {loadingAssembly ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <>
                    <QrCode size={18} color="#0f172a" />
                    <Text className="text-slate-950 font-black text-xs uppercase tracking-wider">
                      Generate QR Code
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View className="bg-[#0b0f19] p-5 rounded-2xl border border-amber-500/40 items-center">
              <Text className="text-amber-500 font-bold text-base mb-1 text-center">{activeAssembly.title}</Text>
              <Text className="text-slate-400 text-xs mb-5 text-center">
                Display this code on screen. Members scan it to confirm presence.
              </Text>

              {/* QR Code Container */}
              <View className="bg-white p-4 rounded-2xl shadow-xl mb-4 items-center justify-center">
                <QRCode
                  getRef={(c) => (qrRef.current = c)}
                  value={JSON.stringify({
                    type: 'GENERAL_ASSEMBLY_CHECKIN',
                    sessionId: activeAssembly._id || activeAssembly.sessionId || activeAssembly.id,
                  })}
                  size={200}
                />
              </View>

              {/* Share QR Button */}
              <TouchableOpacity
                onPress={handleShareQR}
                className="mb-5 bg-slate-900 border border-slate-700 py-2.5 px-5 rounded-xl flex-row items-center gap-2 active:scale-95"
              >
                <Share2 size={15} color="#f59e0b" />
                <Text className="text-amber-400 font-bold text-xs uppercase tracking-wider">
                  Share QR Code
                </Text>
              </TouchableOpacity>

              {/* Attendance Tracker Bar */}
              <View className="w-full flex-row justify-between items-center mb-3">
                <View className="flex-row items-center gap-2">
                  <Users size={16} color="#f59e0b" />
                  <Text className="text-slate-200 font-bold text-xs uppercase tracking-wider">
                    Present Members ({attendees.length})
                  </Text>
                </View>

                <View className="flex-row items-center gap-3">
                  <TouchableOpacity onPress={fetchAttendees} className="p-1">
                    <RefreshCw size={14} color="#94a3b8" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => exportAttendanceCSV({ ...activeAssembly, attendees })}
                    className="bg-emerald-950/60 border border-emerald-700/60 px-2.5 py-1 rounded-lg flex-row items-center gap-1.5 active:scale-95"
                  >
                    <Download size={12} color="#34d399" />
                    <Text className="text-emerald-400 font-bold text-[10px] uppercase">
                      CSV
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Attendee List */}
              <View className="w-full bg-slate-950 rounded-xl p-3 border border-slate-800 max-h-56">
                {attendees.length === 0 ? (
                  <Text className="text-slate-500 text-xs text-center py-6 font-medium">
                    Waiting for scans...
                  </Text>
                ) : (
                  <ScrollView nestedScrollEnabled className="max-h-48">
                    {attendees.map((item, index) => (
                      <View key={item._id || index} className="flex-row justify-between items-center py-2 border-b border-slate-900">
                        <Text className="text-slate-300 text-xs font-semibold">
                          {index + 1}. {item.name || item.userId?.name || 'Member'}
                        </Text>
                        <Text className="text-slate-500 text-[10px]">
                          {new Date(item.timestamp || item.checkedInAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* Close Assembly Session Action Button */}
              <TouchableOpacity
                onPress={handleCloseAssembly}
                className="mt-5 w-full bg-rose-950/80 border border-rose-800/80 py-3.5 px-6 rounded-xl flex-row items-center justify-center gap-2 active:scale-95"
              >
                <Power size={16} color="#f43f5e" />
                <Text className="text-rose-400 font-bold text-xs uppercase tracking-wider">
                  Close & End Session
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}