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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { QrCode, Users, RefreshCw, UserCheck, Share2, Download } from 'lucide-react-native';

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';

export default function AdminView({ token }) {
  // Navigation State between Dashboard Tabs
  const [activeAdminTab, setActiveAdminTab] = useState('approvals'); // 'approvals' | 'assembly'

  // --- USER APPROVAL STATES ---
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // --- GENERAL ASSEMBLY STATES ---
  const [assemblyName, setAssemblyName] = useState('');
  const [activeAssembly, setActiveAssembly] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [loadingAssembly, setLoadingAssembly] = useState(false);

  // Ref to target the SVG element for rendering base64 images
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
      } else {
        console.error('Failed to fetch pending users');
      }
    } catch (err) {
      console.error('Failed fetching pending users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // 2. FETCH ACTIVE ASSEMBLY SESSION (Restores session across logouts/restarts)
  const checkActiveAssembly = async () => {
    try {
      const res = await fetch(`${API_URL}/assembly/session/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'active') {
          setActiveAssembly(data);
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

  // Approve User Handler
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
      console.error('Failed approving user:', err);
      Alert.alert('Error', 'Network error while approving user.');
    }
  };

  // Reject User Handler
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
              } else {
                Alert.alert('Error', 'Failed to reject user.');
              }
            } catch (err) {
              console.error('Failed rejecting user:', err);
              Alert.alert('Error', 'Network error while rejecting user.');
            }
          },
        },
      ]
    );
  };

  // Host New General Assembly
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
        setActiveAssembly(data.assembly);
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

  // Fetch Live Assembly Attendees
  const fetchAttendees = async () => {
    if (!activeAssembly?._id && !activeAssembly?.sessionId) return;
    const targetId = activeAssembly._id || activeAssembly.sessionId;
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

  // Auto-refresh attendee list every 5 seconds when an assembly is active
  useEffect(() => {
    let interval;
    if (activeAssembly) {
      fetchAttendees();
      interval = setInterval(fetchAttendees, 5000);
    }
    return () => clearInterval(interval);
  }, [activeAssembly]);

  // --- EXPO SHARING IMPLEMENTATION FOR QR ---
  const handleShareQR = () => {
    if (!qrRef.current) {
      Alert.alert('Error', 'QR code image element is still loading.');
      return;
    }

    qrRef.current.toDataURL(async (dataUrl) => {
      try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
          return;
        }

        // Clean base64 string
        const pureBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const filename = `Assembly_QR_${Date.now()}.png`;
        const localPath = `${FileSystem.cacheDirectory}${filename}`;

        // Save image to cache directory
        await FileSystem.writeAsStringAsync(localPath, pureBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Open native share menu
        await Sharing.shareAsync(localPath, {
          mimeType: 'image/png',
          dialogTitle: `Share Check-In QR Code: ${activeAssembly?.title || 'General Assembly'}`,
          UTI: 'public.png',
        });
      } catch (err) {
        console.error('Share Error:', err);
        Alert.alert('Share Failed', 'Unable to share QR code image.');
      }
    });
  };

  // --- EXPO FILE SYSTEM & SHARING IMPLEMENTATION FOR EXPORTING CSV ---
  const handleExportCSV = async () => {
    if (!attendees || attendees.length === 0) {
      Alert.alert('No Attendees', 'There are no checked-in members to export.');
      return;
    }

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
        return;
      }

      // Build raw CSV String
      let csvContent = 'Index,Name,Email,CheckIn Time\n';
      attendees.forEach((item, idx) => {
        const time = new Date(item.timestamp || item.checkedInAt || Date.now()).toLocaleTimeString();
        const name = item.name || item.userId?.name || 'Member';
        const email = item.email || item.userId?.email || '';
        csvContent += `"${idx + 1}","${name}","${email}","${time}"\n`;
      });

      // Write File locally using Expo FileSystem
      const fileName = `Attendance_${activeAssembly?.title?.replace(/\s+/g, '_') || 'Assembly'}.csv`;
      const localPath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(localPath, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Present Native Share Interface
      await Sharing.shareAsync(localPath, {
        mimeType: 'text/csv',
        dialogTitle: `Attendance CSV for ${activeAssembly?.title || 'Assembly'}`,
        UTI: 'public.comma-separated-values-text',
      });
    } catch (err) {
      console.error('CSV Export Error:', err);
      Alert.alert('Export Failed', 'Could not create or share the CSV document.');
    }
  };

  return (
    <View className="flex-1 bg-[#05070a] p-4">
      {/* Dashboard Top Navigation Sub-Bar */}
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
                  <Text className="text-slate-600 text-xs mt-1 text-center">
                    All registered builders have been cleared.
                  </Text>
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

                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={() => handleRejectUser(item._id, item.name)}
                      className="bg-rose-950/40 border border-rose-800/50 px-3 py-2.5 rounded-xl active:scale-95"
                    >
                      <Text className="text-rose-400 font-bold text-xs uppercase">Reject</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleApproveUser(item._id)}
                      className="bg-amber-500 px-3 py-2.5 rounded-xl active:scale-95 shadow-md shadow-amber-500/20"
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

      {/* --- TAB 2: GENERAL ASSEMBLY QR HOSTING --- */}
      {activeAdminTab === 'assembly' && (
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <Text className="text-white font-black text-lg tracking-wide mb-0.5">⚡ General Assembly Host</Text>
          <Text className="text-slate-400 text-xs mb-4">Generate check-in QR codes for member attendance</Text>

          {!activeAssembly ? (
            <View className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800">
              <Text className="text-slate-200 font-bold text-sm mb-2">Start Assembly Session</Text>
              <Text className="text-slate-400 text-xs mb-3">
                Create a session for members to scan with their mobile app in the meeting room.
              </Text>

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
                className="bg-amber-500 py-3.5 rounded-xl items-center flex-row justify-center gap-2 active:scale-95 shadow-md shadow-amber-500/20"
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
                    sessionId: activeAssembly._id || activeAssembly.sessionId,
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

              {/* Attendance Tracker */}
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

                  {/* CSV Export Button */}
                  <TouchableOpacity
                    onPress={handleExportCSV}
                    className="bg-emerald-950/60 border border-emerald-700/60 px-2.5 py-1 rounded-lg flex-row items-center gap-1.5 active:scale-95"
                  >
                    <Download size={12} color="#34d399" />
                    <Text className="text-emerald-400 font-bold text-[10px] uppercase">
                      CSV
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

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

              <TouchableOpacity
                onPress={() => setActiveAssembly(null)}
                className="mt-5 bg-slate-800 py-3 px-6 rounded-xl border border-slate-700 active:scale-95"
              >
                <Text className="text-slate-300 font-bold text-xs uppercase tracking-wider">
                  Hide Display Panel
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}