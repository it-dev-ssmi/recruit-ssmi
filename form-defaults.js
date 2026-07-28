/* ==========================================================================
   DEFAULT APPLICATION FORM FIELDS
   โครงสร้างฟอร์มสมัครงานถูกเก็บใน Firestore (settings/applicationForm)
   และแก้ไขได้จากหน้า admin → แท็บ "ตั้งค่า" โดยไม่ต้องแก้โค้ด

   ไฟล์นี้เป็นเพียง "ค่าตั้งต้น" ที่ใช้เมื่อยังไม่เคยบันทึกการตั้งค่า
   (ตรงกับฟอร์มเวอร์ชันเดิมทุกช่อง)

   หมายเหตุ: ช่อง ชื่อ / อีเมล / เบอร์โทร เป็นช่องบังคับถาวรของระบบ
   (Security Rules ตรวจสอบ 3 ช่องนี้) จึงไม่อยู่ในรายการนี้และลบไม่ได้
   ========================================================================== */

export const FIELD_TYPES = [
  { value: "text",     label: "ข้อความสั้น" },
  { value: "textarea", label: "ข้อความยาว (หลายบรรทัด)" },
  { value: "number",   label: "ตัวเลข" },
  { value: "date",     label: "วันที่" },
  { value: "url",      label: "ลิงก์ (URL)" },
  { value: "select",   label: "ตัวเลือก (dropdown)" },
  { value: "file",     label: "แนบไฟล์ PDF" },
  { value: "image",    label: "แนบรูปภาพ" }
];

export const DEFAULT_FORM_FIELDS = [
  {
    id: "experience",
    label: "ประสบการณ์ทำงาน (ปี)",
    type: "text",
    required: false,
    placeholder: "เช่น 2 ปี",
    options: []
  },
  {
    id: "portfolio",
    label: "ลิงก์ประวัติ / พอร์ตโฟลิโอ",
    type: "url",
    required: false,
    placeholder: "https://",
    options: []
  },
  {
    id: "message",
    label: "เหตุผลที่สนใจตำแหน่งนี้",
    type: "textarea",
    required: false,
    placeholder: "เล่าสั้นๆ ว่าทำไมคุณเหมาะกับตำแหน่งนี้",
    options: []
  },
  {
    id: "resume",
    label: "แนบเรซูเม่ (PDF, ไม่เกิน 5MB)",
    type: "file",
    required: false,
    placeholder: "",
    options: []
  }
];
