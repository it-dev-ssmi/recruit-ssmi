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
  { value: "text",     label: "ຂໍ້ຄວາມສັ້ນ" },
  { value: "textarea", label: "ຂໍ້ຄວາມຍາວ (ຫຼາຍແຖວ)" },
  { value: "number",   label: "ຕົວເລກ" },
  { value: "date",     label: "ວັນທີ" },
  { value: "url",      label: "ລິ້ງ (URL)" },
  { value: "select",   label: "ຕົວເລືອກ (dropdown)" },
  { value: "file",     label: "ແນບໄຟລ໌ PDF" },
  { value: "image",    label: "ແນບຮູບພາບ" }
];

export const DEFAULT_FORM_FIELDS = [
  {
    id: "experience",
    label: "ປະສົບການເຮັດວຽກ (ປີ)",
    type: "text",
    required: false,
    placeholder: "ເຊັ່ນ 2 ປີ",
    options: []
  },
  {
    id: "portfolio",
    label: "ລິ້ງປະຫວັດ / ພອດໂຟລິໂອ",
    type: "url",
    required: false,
    placeholder: "https://",
    options: []
  },
  {
    id: "message",
    label: "ເຫດຜົນທີ່ສົນໃຈຕຳແໜ່ງນີ້",
    type: "textarea",
    required: false,
    placeholder: "ເລົ່າສັ້ນໆ ວ່າເປັນຫຍັງທ່ານເໝາະກັບຕຳແໜ່ງນີ້",
    options: []
  },
  {
    id: "resume",
    label: "ແນບເຣຊູເມ (PDF, ບໍ່ເກີນ 5MB)",
    type: "file",
    required: false,
    placeholder: "",
    options: []
  }
];
