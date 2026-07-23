import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { LayoutGrid, MessageSquare, ShieldAlert, Settings, LogOut, X } from 'lucide-react-native';

export default function SideMenu({ visible, onClose, user, onLogout, onSelectTab }) {
  const isAdmin = user?.role === 'admin';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 flex-row bg-black/60">
        {/* Left Side Drawer */}
        <SafeAreaView className="w-4/5 max-w-[300px] h-full bg-[#0a0f1d] border-r border-amber-500/20 p-5 flex-col justify-between shadow-2xl">
          <View>
            {/* Header / Close button */}
            <View className="flex-row justify-between items-center pb-4 mb-4 border-b border-slate-800">
              <View>
                <Text className="text-amber-400 font-black text-lg tracking-wider">NAVIGATION</Text>
                <Text className="text-slate-400 text-xs font-medium">{user?.name || 'Member'}</Text>
              </View>
              <TouchableOpacity 
                onPress={onClose}
                className="p-2 rounded-xl bg-[#030712] border border-slate-800 active:scale-95"
              >
                <X size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Menu Links */}
            <View className="gap-2">
              <TouchableOpacity
                onPress={() => onSelectTab('feed')}
                className="flex-row items-center gap-3 p-3.5 rounded-xl bg-[#030712] border border-slate-800/80 active:bg-amber-500/10"
              >
                <LayoutGrid size={18} color="#f59e0b" />
                <Text className="text-slate-200 font-bold text-sm">Feed</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onSelectTab('chat')}
                className="flex-row items-center gap-3 p-3.5 rounded-xl bg-[#030712] border border-slate-800/80 active:bg-amber-500/10"
              >
                <MessageSquare size={18} color="#f59e0b" />
                <Text className="text-slate-200 font-bold text-sm">Chat</Text>
              </TouchableOpacity>

              {isAdmin && (
                <TouchableOpacity
                  onPress={() => onSelectTab('admin')}
                  className="flex-row items-center gap-3 p-3.5 rounded-xl bg-[#030712] border border-slate-800/80 active:bg-amber-500/10"
                >
                  <ShieldAlert size={18} color="#f59e0b" />
                  <Text className="text-slate-200 font-bold text-sm">Admin View</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => onSelectTab('settings')}
                className="flex-row items-center gap-3 p-3.5 rounded-xl bg-[#030712] border border-slate-800/80 active:bg-amber-500/10"
              >
                <Settings size={18} color="#f59e0b" />
                <Text className="text-slate-200 font-bold text-sm">Settings</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity
            onPress={onLogout}
            className="flex-row items-center justify-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 active:opacity-80"
          >
            <LogOut size={18} color="#fb7185" />
            <Text className="text-rose-400 font-bold text-xs uppercase tracking-widest">Log Out</Text>
          </TouchableOpacity>
        </SafeAreaView>

        {/* Backdrop Pressable to close menu when tapping outside */}
        <Pressable className="flex-1" onPress={onClose} />
      </View>
    </Modal>
  );
}