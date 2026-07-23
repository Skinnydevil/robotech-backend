import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Calendar as CalendarIcon, Clock, MapPin, Plus, ShieldAlert } from 'lucide-react-native';

const API_URL = 'https://robotech-backend-bc05.onrender.com/api';

export default function CalendarView({ user, token }) {
  const isAdmin = user?.role === 'admin';

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Admin Modal / Input State
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('16:00');
  const [location, setLocation] = useState('Lab 101');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_URL}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Error fetching calendar events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an event title.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          date: selectedDate,
          time: time.trim(),
          location: location.trim(),
          description: description.trim(),
        }),
      });

      if (res.ok) {
        const newEvent = await res.json();
        setEvents((prev) => [...prev, newEvent]);
        setTitle('');
        setDescription('');
        setShowAddForm(false);
      } else {
        const errData = await res.json();
        Alert.alert('Error', errData.error || 'Failed to create event');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error creating event.');
    } finally {
      setSubmitting(false);
    }
  };

  // Format marked dates for react-native-calendars safely
  const markedDates = (events || []).reduce((acc, ev) => {
    if (ev && ev.date) {
      acc[ev.date] = {
        marked: true,
        dotColor: '#f59e0b',
        selected: ev.date === selectedDate,
        selectedColor: ev.date === selectedDate ? '#f59e0b' : undefined,
      };
    }
    return acc;
  }, {});

  if (!markedDates[selectedDate]) {
    markedDates[selectedDate] = { selected: true, selectedColor: '#f59e0b' };
  }

  const eventsForSelectedDay = (events || []).filter((ev) => ev.date === selectedDate);

  return (
    <ScrollView 
      className="flex-1 bg-slate-950 p-4"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <View className="flex-row items-center gap-2">
            <CalendarIcon size={20} color="#f59e0b" />
            <Text className="text-amber-500 font-black text-xl tracking-wider">
              CLUB CALENDAR
            </Text>
          </View>
          <Text className="text-slate-400 text-xs mt-0.5 font-medium">
            Upcoming schedules & competition events
          </Text>
        </View>

        {isAdmin && (
          <TouchableOpacity
            onPress={() => setShowAddForm(!showAddForm)}
            className="bg-amber-500/20 border border-amber-500/50 px-3 py-2 rounded-xl flex-row items-center gap-1.5"
          >
            <Plus size={16} color="#f59e0b" />
            <Text className="text-amber-400 font-bold text-xs">
              {showAddForm ? 'Cancel' : 'Add Event'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Admin Add Event Form */}
      {isAdmin && showAddForm && (
        <View className="bg-slate-900 p-5 rounded-2xl border border-amber-500/30 mb-5">
          <View className="flex-row items-center gap-2 mb-3">
            <ShieldAlert size={16} color="#f59e0b" />
            <Text className="text-amber-400 font-extrabold text-xs tracking-wider uppercase">
              Schedule Event for {selectedDate}
            </Text>
          </View>

          <TextInput
            placeholder="Event Title"
            placeholderTextColor="#475569"
            value={title}
            onChangeText={setTitle}
            className="bg-slate-950 text-white px-4 py-3 rounded-xl border border-slate-800 text-sm mb-3 font-medium"
          />

          <View className="flex-row gap-2 mb-3">
            <TextInput
              placeholder="Time (e.g. 16:00)"
              placeholderTextColor="#475569"
              value={time}
              onChangeText={setTime}
              className="flex-1 bg-slate-950 text-white px-4 py-3 rounded-xl border border-slate-800 text-sm font-medium"
            />
            <TextInput
              placeholder="Location"
              placeholderTextColor="#475569"
              value={location}
              onChangeText={setLocation}
              className="flex-1 bg-slate-950 text-white px-4 py-3 rounded-xl border border-slate-800 text-sm font-medium"
            />
          </View>

          <TextInput
            placeholder="Description / Notes"
            placeholderTextColor="#475569"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
            className="bg-slate-950 text-white px-4 py-3 rounded-xl border border-slate-800 text-sm mb-4 font-medium"
          />

          <TouchableOpacity
            onPress={handleCreateEvent}
            disabled={submitting}
            className="bg-amber-500 py-3 rounded-xl items-center shadow-lg shadow-amber-500/20"
          >
            {submitting ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text className="text-slate-950 font-black text-xs uppercase tracking-widest">
                Publish Event
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Calendar Component Wrapper */}
      <View className="rounded-2xl overflow-hidden border border-slate-800 mb-5 bg-slate-900">
        <Calendar
          onDayPress={(day) => setSelectedDate(day.dateString)}
          markedDates={markedDates}
          theme={{
            backgroundColor: '#0f172a',
            calendarBackground: '#0f172a',
            textSectionTitleColor: '#64748b',
            selectedDayBackgroundColor: '#f59e0b',
            selectedDayTextColor: '#020617',
            todayTextColor: '#f59e0b',
            dayTextColor: '#e2e8f0',
            textDisabledColor: '#334155',
            dotColor: '#f59e0b',
            selectedDotColor: '#020617',
            arrowColor: '#f59e0b',
            monthTextColor: '#f59e0b',
            indicatorColor: '#f59e0b',
            textDayFontWeight: '600',
            textMonthFontWeight: 'bold',
            textDayHeaderFontWeight: 'bold',
          }}
        />
      </View>

      {/* Selected Day Events List */}
      <Text className="text-slate-300 font-extrabold text-xs mb-3 tracking-wider uppercase">
        Events for {selectedDate}
      </Text>

      {loading ? (
        <ActivityIndicator color="#f59e0b" className="py-6" />
      ) : eventsForSelectedDay.length === 0 ? (
        <View className="bg-slate-900 p-6 rounded-2xl border border-slate-800/80 items-center">
          <Text className="text-slate-500 text-xs font-medium">
            No events scheduled for this date.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {eventsForSelectedDay.map((item, index) => (
            <View
              key={item._id || item.id || index}
              className="bg-slate-900 p-4 rounded-2xl border border-slate-800 border-l-4 border-l-amber-500"
            >
              <Text className="text-white font-bold text-base mb-1">
                {item.title}
              </Text>

              <View className="flex-row items-center gap-4 mb-2">
                {item.time ? (
                  <View className="flex-row items-center gap-1">
                    <Clock size={12} color="#f59e0b" />
                    <Text className="text-amber-400 font-bold text-xs">
                      {item.time}
                    </Text>
                  </View>
                ) : null}

                {item.location ? (
                  <View className="flex-row items-center gap-1">
                    <MapPin size={12} color="#64748b" />
                    <Text className="text-slate-400 text-xs font-medium">
                      {item.location}
                    </Text>
                  </View>
                ) : null}
              </View>

              {item.description ? (
                <Text className="text-slate-400 text-xs leading-5">
                  {item.description}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}