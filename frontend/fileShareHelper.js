import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

/**
 * Creates a CSV file of session attendees and opens the native share menu.
 * @param {Object} session - The active assembly session object (must contain an attendees array).
 */
export const exportAttendanceCSV = async (session) => {
  try {
    if (!session || !session.attendees || session.attendees.length === 0) {
      Alert.alert('No Data', 'There are no attendees to export for this session.');
      return;
    }

    // Build CSV Header & Rows with fallback data resolution
    const csvHeader = 'Index,Name,Email,Checked-In At\n';
    const csvRows = session.attendees
      .map((item, idx) => {
        const name = item.name || item.userId?.name || 'Member';
        const email = item.email || item.userId?.email || 'N/A';
        const rawDate = item.timestamp || item.checkedInAt;
        const date = rawDate ? new Date(rawDate).toLocaleString() : 'N/A';

        // Escape double quotes inside names or emails to prevent CSV corruption
        const safeName = name.replace(/"/g, '""');
        const safeEmail = email.replace(/"/g, '""');

        return `"${idx + 1}","${safeName}","${safeEmail}","${date}"`;
      })
      .join('\n');

    const csvData = csvHeader + csvRows;

    // Sanitize session title for file naming
    const sanitizedTitle = (session.title || 'Assembly')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();
    const filename = `Attendance_${sanitizedTitle}_${Date.now()}.csv`;
    const path = `${FileSystem.cacheDirectory}${filename}`;

    // Write CSV content to local cache directory
    await FileSystem.writeAsStringAsync(path, csvData, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Check availability
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return;
    }

    // Open native OS share dialog
    await Sharing.shareAsync(path, {
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
 * Saves a base64 image string to temporary cache and opens the share menu.
 * @param {string} base64Image - The raw or dataURL base64 string from the QR code component.
 * @param {string} sessionTitle - Title of the assembly session for the dialog header.
 */
export const shareQRCode = async (base64Image, sessionTitle = 'General Assembly') => {
  try {
    if (!base64Image || typeof base64Image !== 'string') {
      Alert.alert('Error', 'No QR Code image available to share.');
      return;
    }

    // Strip data URL prefix if passed (e.g. "data:image/png;base64,...")
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
    console.error('QR Share Error:', error);
    Alert.alert('Share Failed', 'Unable to share QR code image.');
  }
};