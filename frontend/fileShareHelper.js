import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { Alert, Platform } from 'react-native';

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
    const path = `${RNFS.CachesDirectoryPath}/${filename}`;

    await RNFS.writeFile(path, csvData, 'utf8');

    await Share.open({
      title: 'Export Assembly Attendance',
      message: `Attendance log for ${session.title || 'General Assembly'}`,
      url: Platform.OS === 'android' ? `file://${path}` : path,
      type: 'text/csv',
      filename,
    });
  } catch (error) {
    if (error && error.message !== 'User did not share') {
      Alert.alert('Export Failed', 'Unable to generate and share attendance file.');
    }
  }
};

// Function 2: Shares the live QR code image
export const shareQRCode = async (base64Image, sessionTitle = 'General Assembly') => {
  try {
    if (!base64Image) {
      Alert.alert('Error', 'No QR Code image available to share.');
      return;
    }

    const formattedBase64 = base64Image.startsWith('data:image')
      ? base64Image
      : `data:image/png;base64,${base64Image}`;

    await Share.open({
      title: `Share Check-In QR Code: ${sessionTitle}`,
      message: `Scan this QR code to check into ${sessionTitle}`,
      url: formattedBase64,
      type: 'image/png',
    });
  } catch (error) {
    if (error && error.message !== 'User did not share') {
      Alert.alert('Share Failed', 'Unable to share QR code image.');
    }
  }
};