import axios from 'axios';
import qs from 'qs';

// ฟังก์ชันขอ Token
export async function getMicrosoftAccessToken(): Promise<string> {
    const url = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
    
    const data = qs.stringify({
        'client_id': process.env.MICROSOFT_CLIENT_ID,
        'client_secret': process.env.MICROSOFT_CLIENT_SECRET,
        'grant_type': 'client_credentials',
        'scope': 'https://graph.microsoft.com/.default'
    });

    try {
        const response = await axios.post(url, data, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data.access_token;
    } catch (error: any) {
        console.error('Error getting MS Token:', error.response?.data || error.message);
        throw new Error('ไม่สามารถขอตั๋วผ่านทางจาก Microsoft ได้');
    }
}

// ฟังก์ชันอัปโหลดไฟล์
export async function uploadFileToOneDrive(fileBuffer: Buffer, fileName: string): Promise<string> {
    const accessToken = await getMicrosoftAccessToken();
    const encodedFileName = encodeURIComponent(fileName);
    
    // ชี้ไปที่โฟลเดอร์โรงเรียนใน OneDrive
    const url = `https://graph.microsoft.com/v1.0/users/${process.env.MICROSOFT_TARGET_EMAIL}/drive/root:/WKK_School_Uploads/${encodedFileName}:/content`;

    try {
        const response = await axios.put(url, fileBuffer, {
            headers: { 
                'Authorization': `Bearer ${accessToken}`, 
                'Content-Type': 'application/octet-stream'
            }
        });
        
        // คืนค่าเป็นลิงก์ดาวน์โหลดตรงเพื่อเอาไปเซฟลง Supabase
        return response.data['@microsoft.graph.downloadUrl'] || response.data.webUrl;
    } catch (error: any) {
        console.error('Error uploading to OneDrive:', error.response?.data || error.message);
        throw new Error('ไม่สามารถส่งไฟล์ไปที่ OneDrive ได้');
    }
}