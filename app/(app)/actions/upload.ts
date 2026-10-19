'use server'

import { uploadFileToOneDrive } from '@/lib/onedrive';
import { createClient } from '@supabase/supabase-js'; // สมมติว่านี่คือสคริปต์เชื่อมต่อ Supabase ของคุณ

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function handleStudentRegister(formData: FormData) {
  try {
    // 1. ดึงค่าจากฟอร์มหน้าบ้าน
    const studentCode = formData.get('student_code') as string;
    const firstName = formData.get('first_name') as string;
    const lastName = formData.get('last_name') as string;
    const file = formData.get('profile_photo') as File; // ดึงไฟล์ภาพมา

    let photoUrl = null;

    // 2. ถ้าผู้ใช้มีการแนบรูปภาพมาด้วย
    if (file && file.size > 0) {
      // แปลงไฟล์จากหน้าเว็บให้กลายเป็น Buffer เพื่อส่งให้ฟังก์ชัน OneDrive อัปโหลด
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const fileName = `${studentCode}_profile.jpg`;
      
      // ส่งเข้า OneDrive (เรียกใช้ฟังก์ชันที่เราทำไว้ในสเต็ปที่ 2)
      photoUrl = await uploadFileToOneDrive(buffer, fileName);
    }

    // 3. เอาลิงก์ที่ได้ไปบันทึกลง Supabase Database ร่วมกับข้อมูลอื่น ๆ
    const { data, error } = await supabase
      .from('students')
      .insert([
        {
          student_code: studentCode,
          first_name: firstName,
          last_name: lastName,
          profile_photo_url: photoUrl // ลิงก์จาก OneDrive จะถูกบันทึกที่นี่
        }
      ]);

    if (error) throw error;
    return { success: true, message: 'บันทึกข้อมูลสำเร็จ ไฟล์ไปอยู่บน OneDrive แล้ว!' };

  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
}