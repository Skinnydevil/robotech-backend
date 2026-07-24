import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

// Function 1: Creates a CSV file of attendees and opens the share menu
export const exportAttendanceCSV = async (session) => {
  try {
    if (!session || !session.attendees || session.attendees.length === 0) {
      Alert.alert('No Data', 'There are no attendees to export for this session.');
      return;
    }

    let csvHeader = 'Name,Email,Checked-In At\n';
    let csvRows = session.attendees
      .map((item) => {
        const name = item.userId?.name || 'Unknown';
        const email = item.userId?.email || 'N/A';
        const date = item.checkedInAt
          ? new Date(item.checkedInAt).toLocaleString()
          : 'N/A';
        return `"${name}","${email}","${date}"`;
      })
      .join('\n');

    const csvData = csvHeader + csvRows;
    const filename = `Assembly_Attendance_${session._id || Date.now()}.csv`;
    const path = `${FileSystem.cacheDirectory}${filename}`;

    // Write CSV content to local cache directory
    await FileSystem.writeAsStringAsync(path, csvData, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Verify sharing is available on device
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return;
    }

    await Sharing.shareAsync(path, {
      mimeType: 'text/csv',
      dialogTitle: `Attendance log for ${session.title || 'General Assembly'}`,
      UTI: 'public.comma-separated-values-text',
    });
  } catch (error) {
    Alert.alert('Export Failed', 'Unable to generate and share attendance file.');
  }
};

// Function 2: Shares the live QR code image
export const shareQRCode = async (base64Image, sessionTitle = 'General Assembly') => {
  try {
    if (!base64Image) {
      Alert.alert('Error', 'No QR Code image available to share.');
      return;
    }

    // Strip base64 data URL prefix if present to save pure base64 string
    const pureBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const filename = `QRCode_${Date.now()}.png`;
    const path = `${FileSystem.cacheDirectory}${filename}`;

    // Write base64 image data to temporary file
    await FileSystem.writeAsStringAsync(path, pureBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return;
    }

    await Sharing.shareAsync(path, {
      mimeType: 'image/png',
      dialogTitle: `Share Check-In QR Code: ${sessionTitle}`,
      UTI: 'public.png',
    });
  } catch (error) {
    Alert.alert('Share Failed', 'Unable to share QR code image.');
  }
};