import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

/**
 * Creates a CSV file of session attendees and opens the native share menu.
 */
export const exportAttendanceCSV = async (session) => {
  try {
    if (!session || !session.attendees || session.attendees.length === 0) {
      Alert.alert('No Data', 'There are no attendees to export for this session.');
      return;
    }

    const csvHeader = 'Index,Name,Email,Checked-In At\n';
    const csvRows = session.attendees
      .map((item, idx) => {
        const name = item.name || item.userId?.name || 'Member';
        const email = item.email || item.userId?.email || 'N/A';
        const rawDate = item.timestamp || item.checkedInAt;
        const date = rawDate ? new Date(rawDate).toLocaleString() : 'N/A';

        const safeName = name.replace(/"/g, '""');
        const safeEmail = email.replace(/"/g, '""');

        return `"${idx + 1}","${safeName}","${safeEmail}","${date}"`;
      })
      .join('\n');

    const csvData = csvHeader + csvRows;
    const sanitizedTitle = (session.title || 'Assembly')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();
    const filename = `Attendance_${sanitizedTitle}_${Date.now()}.csv`;
    const localPath = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(localPath, csvData, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return;
    }

    await Sharing.shareAsync(localPath, {
      mimeType: 'text/csv',
      dialogTitle: `Attendance log for ${session.title || 'General Assembly'}`,
      UTI: 'public.comma-separated-values-text',
    });
  } catch (error) {
    console.error('CSV Export Error:', error);
    Alert.alert('Export Failed', 'Unable to generate and share attendance file.');
  }
};

/**
 * Saves a base64 image string to temporary cache and opens the share menu with file URI.
 */
export const shareQRCode = async (base64Image, sessionTitle = 'General Assembly') => {
  try {
    if (!base64Image || typeof base64Image !== 'string') {
      Alert.alert('Error', 'No QR Code image available to share.');
      return;
    }

    const pureBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const filename = `Assembly_QR_${Date.now()}.png`;
    const localPath = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(localPath, pureBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return;
    }

    await Sharing.shareAsync(localPath, {
      mimeType: 'image/png',
      dialogTitle: `Share Check-In QR Code: ${sessionTitle}`,
      UTI: 'public.png',
    });
  } catch (error) {
    console.error('QR Share Error:', error);
    Alert.alert('Share Failed', 'Unable to share QR code image.');
  }
};