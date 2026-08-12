/* ==========================================================================
   FIREBASE SETUP
   Config lives in firebase-config.js — that's the only file you need to
   edit with your own project's credentials. See README.md to get started.
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, serverTimestamp, getDocs, getDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import {
  firebaseConfig, HR_NOTIFY_EMAILS, APPLICATIONS_COLLECTION,
  DEPARTMENTS_COLLECTION, BRANCHES_COLLECTION, SETTINGS_COLLECTION,
  RESUME_STORAGE_FOLDER, ATTACHMENTS_STORAGE_FOLDER
} from "./firebase-config.js";
import { DEFAULT_DEPARTMENTS } from "./departments-data.js";
import { DEFAULT_BRANCHES } from "./branches-data.js";
import { DEFAULT_FORM_FIELDS } from "./form-defaults.js";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const FIREBASE_NOT_CONFIGURED = firebaseConfig.apiKey === "YOUR_API_KEY";

/* ==========================================================================
   DEPARTMENT DATA
   ข้อมูลแผนกถูกโหลดจาก Firestore (collection "departments") ซึ่งจัดการได้
   จากหน้า admin.html — ถ้ายังไม่ได้ตั้งค่า Firebase หรือยังไม่มีข้อมูลใน
   Firestore จะใช้ข้อมูลตั้งต้นจาก departments-data.js แทนชั่วคราว
   ========================================================================== */
let DEPARTMENTS = [];

/* ຕຳແໜ່ງທີ່ "ໃຊ້ງານຢູ່" ໃນຄັງຕຳແໜ່ງຂອງອົງກອນ (ບໍ່ມີຟິວ active ຖືວ່າໃຊ້ງານ)
   ໝາຍເຫດ: ພະແນກເປັນພຽງ "ຄັງຕຳແໜ່ງ" — ການເປີດຮັບຈິງຂຶ້ນກັບແຕ່ລະສາຂາ */
const isActive = p => p.active !== false;
const activePositions = d => (d.positions || []).filter(isActive);

async function loadDepartments(){
  if(FIREBASE_NOT_CONFIGURED){
    DEPARTMENTS = DEFAULT_DEPARTMENTS;
    return;
  }
  try {
    const snap = await getDocs(query(collection(db, DEPARTMENTS_COLLECTION), orderBy("order")));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    DEPARTMENTS = list.length ? list : DEFAULT_DEPARTMENTS;
  } catch (err){
    console.error("โหลดข้อมูลแผนกจาก Firestore ไม่สำเร็จ ใช้ข้อมูลตั้งต้นแทน:", err);
    DEPARTMENTS = DEFAULT_DEPARTMENTS;
  }
}

/* ==========================================================================
   BRANCH DATA — ສາຂາ/ແຂວງ
   ແຕ່ລະສາຂາເປີດຮັບຕຳແໜ່ງບໍ່ຄືກັນ ໂດຍອ້າງອີງ position.id ຈາກ DEPARTMENTS
   ຊຸດດຽວກັນ (ບໍ່ໄດ້ແຍກຂໍ້ມູນຕຳແໜ່ງເປັນຂອງແຕ່ລະສາຂາ) — ຈັດການໄດ້ຈາກ
   admin → ແທັບ "ຈັດການສາຂາ" — allPositions: true ໝາຍເຖິງເປີດຮັບທຸກຕຳແໜ່ງ
   ========================================================================== */
let BRANCHES = [];
let currentBranchId = localStorage.getItem("ssmi-branch") || null;

async function loadBranches(){
  if(FIREBASE_NOT_CONFIGURED){
    BRANCHES = DEFAULT_BRANCHES;
  } else {
    try {
      const snap = await getDocs(query(collection(db, BRANCHES_COLLECTION), orderBy("order")));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      BRANCHES = list.length ? list : DEFAULT_BRANCHES;
    } catch (err){
      console.error("โหลดข้อมูลสาขาจาก Firestore ไม่สำเร็จ ใช้ข้อมูลตั้งต้นแทน:", err);
      BRANCHES = DEFAULT_BRANCHES;
    }
  }
  if(!BRANCHES.find(b => b.id === currentBranchId)){
    currentBranchId = BRANCHES[0]?.id || null;
  }
}

function currentBranch(){
  return BRANCHES.find(b => b.id === currentBranchId) || BRANCHES[0];
}

/* ==========================================================================
   ລໍຈິກກວດສອບການເປີດຮັບສະໝັກ (ອ້າງອີງຈາກ branch.openings)
   ========================================================================== */
/* ສາຂານີ້ "ມີ" ຕຳແໜ່ງນີ້ບໍ່ (ຢູ່ໃນ openings) — ມີ = ສະແດງໃຫ້ເຫັນ ແລະ ຝາກປະຫວັດໄດ້ */
function hasPositionInBranch(branch, p){
  if(!isActive(p)) return false;
  if(!branch) return true;
  if(branch.allPositions) return true;
  return (branch.openings || []).some(op => op.posId === p.id);
}

/* ດຶງວັນທີປິດຮັບສະໝັກ (ถ้าเลยกำหนดไปแล้ว ไม่ต้องส่งไปแสดงผล) */
function getPositionDeadline(branch, p){
  if(!branch) return "";
  const opening = (branch.openings || []).find(op => op.posId === p.id);
  if(!opening || !opening.deadline) return "";
  
  const today = new Date();
  const todayStr = today.getFullYear() + "-" + 
                   String(today.getMonth() + 1).padStart(2, '0') + "-" + 
                   String(today.getDate()).padStart(2, '0');
                   
  // คืนค่าวันที่เฉพาะกรณีที่ "ยังไม่หมดเวลา" เท่านั้น
  return opening.deadline >= todayStr ? opening.deadline : "";
}

/* ຈຳນວນອັດຕາທີ່ສາຂານີ້ຮັບ (0 = ມີຕຳແໜ່ງ ແຕ່ຍັງບໍ່ເປີດຮັບ) */
function getPositionHeadcount(branch, p){
  if(!branch) return 0;
  const opening = (branch.openings || []).find(op => op.posId === p.id);
  if(!opening) return 0;
  
  // ⏳ ระบบปิดรับอัตโนมัติ: เทียบวันที่ปิดรับ กับ วันนี้
  if (opening.deadline) {
    const today = new Date();
    const todayStr = today.getFullYear() + "-" + 
                     String(today.getMonth() + 1).padStart(2, '0') + "-" + 
                     String(today.getDate()).padStart(2, '0');
                     
    if (opening.deadline < todayStr) {
      return 0; // ถ้าเลยกำหนดมาแล้ว ให้บังคับเปลี่ยนโควต้าเป็น 0 ทันที
    }
  }

  return Math.max(0, Number(opening.count) || 0);
}

/* "ເປີດຮັບແທ້" = ມີໃນສາຂາ ແລະ ຈຳນວນອັດຕາ > 0 */
function isPositionOpenInBranch(branch, p){
  return hasPositionInBranch(branch, p) && getPositionHeadcount(branch, p) > 0;
}

/* ຕຳແໜ່ງທັງໝົດທີ່ສາຂານີ້ມີ (ລວມທີ່ຍັງບໍ່ເປີດຮັບ) */
function branchListedPositions(d, branch = currentBranch()){
  return (d.positions || []).filter(p => hasPositionInBranch(branch, p));
}

/* ສະເພາະຕຳແໜ່ງທີ່ເປີດຮັບຢູ່ໃນສາຂານີ້ */
function branchOpenPositions(d, branch = currentBranch()){
  return (d.positions || []).filter(p => isPositionOpenInBranch(branch, p));
}

/* ລວມຈຳນວນອັດຕາທັງໝົດຂອງສາຂານີ້ */
function branchTotalSeats(branch = currentBranch()){
  return DEPARTMENTS.reduce((sum, d) => sum + (d.positions || []).reduce(
    (s, p) => s + (hasPositionInBranch(branch, p) ? getPositionHeadcount(branch, p) : 0), 0), 0);
}

/* ==========================================================================
   SETTINGS — อีเมลแจ้งเตือน HR + โครงสร้างฟอร์มสมัคร
   ทั้งสองอย่างแก้ไขได้จากหน้า admin → แท็บ "ตั้งค่า" (เก็บใน Firestore
   collection "settings") — ถ้ายังไม่เคยตั้งค่า จะใช้ค่าตั้งต้นจากไฟล์แทน
   ========================================================================== */
let NOTIFY_EMAILS = HR_NOTIFY_EMAILS;
/* ຊ່ອງລະບົບ 3 ຊ່ອງ (ຊື່ / ອີເມວ / ເບີໂທ) — ລຶບບໍ່ໄດ້ ເພາະ Firestore rules ບັງຄັບໄວ້
   ແຕ່ປ່ຽນຊື່ປ້າຍ ຈັດລຳດັບ ແລະ ປັບຄວາມກວ້າງໄດ້ຈາກໜ້າ admin → ແທັບ "ຕັ້ງຄ່າ" */
const CORE_DEFAULTS = [
  { id: "core_name",  core: "name",  type: "text",  label_la: "ຊື່ ແລະ ນາມສະກຸນ", label_en: "Full name",    width: "half", required: true, placeholder: "" },
  { id: "core_email", core: "email", type: "email", label_la: "ອີເມວ",            label_en: "Email",        width: "half", required: true, placeholder: "" },
  { id: "core_phone", core: "phone", type: "tel",   label_la: "ເບີໂທລະສັບ",       label_en: "Phone number", width: "half", required: true, placeholder: "" }
];

/* ຮັບປະກັນວ່າຟອມມີຊ່ອງລະບົບຄົບ 3 ຊ່ອງສະເໝີ + ຮອງຮັບຂໍ້ມູນເກົ່າ (coreFields / label) */
function normalizeFormFields(fields, legacyCore){
  const list = (Array.isArray(fields) ? fields : []).map(f => ({ ...f }));
  /* ຂໍ້ມູນເກົ່າມີແຕ່ label ດຽວ — ເຕີມ label_la / width / type ໃຫ້ຄົບ */
  list.forEach(f => {
    f.label_la = f.label_la || f.label || "";
    f.label_en = f.label_en || "";
    f.label    = f.label_la;
    f.width    = f.width || "half";
    f.type     = f.type || "text";
    f.step     = Math.max(1, Math.min(9, Number(f.step) || 1));   // ໜ້າທີ່ຊ່ອງນີ້ຢູ່
  });
  const missing = [];
  CORE_DEFAULTS.forEach(def => {
    const found = list.find(f => f.core === def.core);
    if(found){
      found.id       = found.id || def.id;
      found.type     = def.type;          // ປະເພດຂອງຊ່ອງລະບົບ ປ່ຽນບໍ່ໄດ້
      found.required = true;              // ບັງຄັບກອກສະເໝີ
      found.label_la = found.label_la || found.label || def.label_la;
      found.label_en = found.label_en || def.label_en;
      found.width    = found.width || def.width;
      found.step     = Math.max(1, Math.min(9, Number(found.step) || 1));
    } else {
      missing.push({
        ...def,
        label_la: (legacyCore && legacyCore[def.core + "_la"]) || def.label_la,
        label_en: (legacyCore && legacyCore[def.core + "_en"]) || def.label_en
      });
    }
  });
  missing.forEach(f => { f.step = 1; });
  return [...missing, ...list];
}

/* ຫົວຂໍ້ຂອງແຕ່ລະໜ້າ (1 ແຖວ = 1 ໜ້າ) ຕັ້ງໄດ້ຈາກໜ້າ admin → ແທັບ "ຕັ້ງຄ່າ" */
let STEP_TITLES = [];

let FORM_FIELDS = normalizeFormFields(DEFAULT_FORM_FIELDS);

async function loadSettings(){
  if(FIREBASE_NOT_CONFIGURED) return;
  try {
    const [notifSnap, formSnap] = await Promise.all([
      getDoc(doc(db, SETTINGS_COLLECTION, "notifications")),
      getDoc(doc(db, SETTINGS_COLLECTION, "applicationForm"))
    ]);
    if(notifSnap.exists() && Array.isArray(notifSnap.data().emails) && notifSnap.data().emails.length){
      NOTIFY_EMAILS = notifSnap.data().emails;
    }
    if(formSnap.exists()){
      FORM_FIELDS = normalizeFormFields(formSnap.data().fields, formSnap.data().coreFields);
      STEP_TITLES = Array.isArray(formSnap.data().stepTitles) ? formSnap.data().stepTitles : [];
    }
  } catch (err){
    console.error("โหลดการตั้งค่าไม่สำเร็จ ใช้ค่าตั้งต้นแทน:", err);
  }
}

/* ==========================================================================
   LANGUAGE (i18n) — ລາວ (default) / English
   - ຂໍ້ຄວາມຂອງໜ້າເວັບ (UI) ແປຄົບທັງສອງພາສາໃນ dictionary ດ້ານລຸ່ມ
   - ເນື້ອໃນຝ່າຍ/ຕຳແໜ່ງມາຈາກ Firestore: ຖ້າ document ມີຟິວ *_en
     (ເຊັ່ນ name_en, mission_en, title_en) ຈະໃຊ້ພາສາອັງກິດເມື່ອສະຫຼັບເປັນ EN
     ຖ້າບໍ່ມີ ຈະສະແດງພາສາລາວຕາມເດີມ
   ========================================================================== */
const I18N = {
  la: {
    docTitle: "ຮ່ວມງານກັບ SSMI — ສະໝັກງານຕາມສາຍງານ",
    brand: "SSMI — ສິນຊັບເມືອງເໜືອ",
    navAll: "ຕຳແໜ່ງທັງໝົດ",
    heroEyebrow: "ຮ່ວມງານກັບ ສິນຊັບເມືອງເໜືອ",
    heroTitle: 'ເລືອກຕຳແໜ່ງທ່ານໂດດເດັ່ນ <span class="grad">ຄົ້ນຫາບົດບາດ</span> ທີ່ເປັນຂອງທ່ານ',
    heroSub: "ສຳຫຼວດແຕ່ລະຕຳແໜ່ງໃນສະຖາບັນການເງິນຈຸລະພາກຂອງພວກເຮົາ ເບິ່ງພາລະໜ້າທີ່ ແລະ ຕຳແໜ່ງທີ່ເປີດຮັບ ແລ້ວຍື່ນໃບສະໝັກໄດ້ທັນທີຈາກໜ້ານີ້",
    statDepts: "ຕຳແໜ່ງທັງໝົດ",
    statOpen: "ຕຳແໜ່ງທີ່ເປີດຮັບ",
    branchTitle: "ເລືອກແຂວງທີ່ທ່ານສົນໃຈ",
    branchSub: n => `ທັງໝົດ ${n} ແຂວງ — ກົດເລືອກແຂວງເພື່ອເບິ່ງຕຳແໜ່ງຂອງແຂວງນັ້ນ`,
    branchLabel: "ແຂວງ",
    dirTitle: "ເລືອກສາຍງານທີ່ທ່ານສົນໃຈ",
    dirSub: "ຄລິກທີ່ກາດເພື່ອເບິ່ງລາຍລະອຽດ ແລະ ຕຳແໜ່ງທີ່ເປີດຮັບ",
    nDuties: n => `${n} ພາລະບົດບາດຫຼັກ`,
    openN: n => `ເປີດຮັບ ${n} ຕຳແໜ່ງ`,
    openZero: "ຝາກປະຫວັດໄວ້",
    seatsN: n => `ຮັບ ${n} ຕຳແໜ່ງ`,
    listedN: n => `ມີ ${n} ຕຳແໜ່ງໃນແຂວງນີ້`,
    back: "← ກັບໄປໜ້າຕຳແໜ່ງທັງໝົດ",
    openPositions: "ຕຳແໜ່ງເປີດຮັບ",
    respTitle: "ໜ້າທີ່ຫຼັກຂອງຕຳແໜ່ງນີ້",
    respTitles: "ໜ້າທີ່ຫຼັກຂອງຕຳແໜ່ງນີ້",
    posTitle: "ຕຳແໜ່ງໃນແຂວງນີ້",
    posEmpty: "ແຂວງນີ້ນີ້ຍັງບໍ່ມີຕຳແໜ່ງຂອງຕຳແໜ່ງນີ້ ຫາກສົນໃຈຮ່ວມງານໃນອະນາຄົດ ສາມາດຝາກປະຫວັດໄວ້ລ່ວງໜ້າໄດ້",
    applyGeneral: "ຝາກປະຫວັດໄວ້ກັບຕຳແໜ່ງນີ້",
    generalTitle: "ຝາກປະຫວັດທົ່ວໄປ",
    applyBtn: "ສະໝັກຕຳແໜ່ງນີ້",
    closedTag: "ຍັງບໍ່ເປີດຮັບ",
    applyClosedBtn: "ຝາກປະຫວັດໄວ້ລ່ວງໜ້າ",
    dutiesN: n => `ພາລະໜ້າທີ່ໂດຍລະອຽດ (${n} ຂໍ້)`,
    applyFor: t => `ສະໝັກຕຳແໜ່ງ: ${t}`,
    fName: 'ຊື່ ແລະ ນາມສະກຸນ <em>*</em>',
    fEmail: 'ອີເມວ <em>*</em>',
    fPhone: 'ເບີໂທລະສັບ <em>*</em>',
    formNote: "ເມື່ອກົດສົ່ງ ຂໍ້ມູນຂອງທ່ານຈະຖືກບັນທຶກເຂົ້າລະບົບ ແລະ ແຈ້ງເຕືອນຝ່າຍບຸກຄະລາກອນໂດຍອັດຕະໂນມັດ",
    submit: "ສົ່ງໃບສະໝັກ",
    selectPlaceholder: "— ເລືອກ —",
    footerBrand: "SSMI ສິນຊັບເມືອງເໜືອ",
    footerNote: "ຂໍ້ມູນຜູ້ສະໝັກຈະຖືກສົ່ງຕົງເຖິງຝ່າຍບຸກຄະລາກອນເພື່ອພິຈາລະນາ",
    loading: "ກຳລັງໂຫຼດຂໍ້ມູນຕຳແໜ່ງ...",
    errNotConfigured: "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Firebase — ເບິ່ງວິທີຕັ້ງຄ່າໃນ README.md",
    errCore: "ກະລຸນາກອກຊື່, ອີເມວ ແລະ ເບີໂທລະສັບໃຫ້ຄົບ",
    errNeedFile: label => `ກະລຸນາແນບໄຟລ໌: ${label}`,
    errFileSize: label => `ໄຟລ໌ "${label}" ຕ້ອງມີຂະໜາດບໍ່ເກີນ 5MB`,
    errNeedField: label => `ກະລຸນາກອກ: ${label}`,
    sending: "ກຳລັງສົ່ງໃບສະໝັກ...",
    sent: "ສົ່ງໃບສະໝັກຮຽບຮ້ອຍ ຂອບໃຈທີ່ສົນໃຈຮ່ວມງານກັບພວກເຮົາ",
    navOpen: "ຕຳແໜ່ງທີ່ເປີດຮັບ",
    openingsTitle: "ຕຳແໜ່ງທີ່ກຳລັງເປີດຮັບທັງໝົດ",
    openingsSub: "ລວມຕຳແໜ່ງວ່າງຈາກທຸກສາຂາ/ໜ່ວຍບໍລິການ ແລະ ທຸກຕຳແໜ່ງ ທີ່ທ່ານສາມາດຍື່ນສະໝັກໄດ້ທັນທີ",
    sendFailed: "ເກີດຂໍ້ຜິດພາດໃນການສົ່ງໃບສະໝັກ ກະລຸນາລອງໃໝ່ອີກຄັ້ງ",
    stepOf: (a, b) => `ຂັ້ນຕອນທີ ${a} ຈາກ ${b}`,
    stepDefault: n => `ຂໍ້ມູນຊຸດທີ ${n}`,
    nextStep: "ຖັດໄປ →",
    prevStep: "← ກັບຄືນ",
    confirmClose: "ທ່ານກຳລັງກອກຟອມຢູ່ ຕ້ອງການປິດແທ້ບໍ່?\n\n(ຂໍ້ມູນທີ່ກອກໄວ້ຈະຖືກເກັບໄວ້ໃນເຄື່ອງຂອງທ່ານ ເປີດຟອມຄືນເມື່ອໃດກໍ່ກອກຕໍ່ໄດ້ ຍົກເວັ້ນໄຟລ໌ແນບທີ່ຕ້ອງເລືອກໃໝ່)",
    draftRestored: "ກູ້ຂໍ້ມູນທີ່ທ່ານກອກຄ້າງໄວ້ຄືນມາແລ້ວ (ໄຟລ໌ແນບຕ້ອງເລືອກໃໝ່)",
    draftClear: "ລ້າງ ແລະ ເລີ່ມໃໝ່",
    draftSaved: "ບັນທຶກຮ່າງໄວ້ໃນເຄື່ອງແລ້ວ",
    confirmClearDraft: "ລ້າງຂໍ້ມູນທີ່ກອກໄວ້ທັງໝົດ ແລະ ເລີ່ມກອກໃໝ່?",
    sendingTitle: "ກຳລັງສົ່ງໃບສະໝັກຂອງທ່ານ",
    sendingSub: "ກະລຸນາຢ່າປິດໜ້ານີ້ ຫຼື ກົດຍ້ອນກັບ ຈົນກວ່າຈະສຳເລັດ",
    uploadingFile: (i, n, name) => `ກຳລັງອັບໂຫຼດໄຟລ໌ແນບ ${i}/${n} — ${name}`,
    savingData: "ກຳລັງບັນທຶກຂໍ້ມູນເຂົ້າລະບົບ...",
    doneTitle: "ສົ່ງໃບສະໝັກສຳເລັດແລ້ວ",
    doneSub: "ຫວັງວ່າຈະໄດ້ຮ່ວມງານກັນເດີ້ 🎉",
    doneNote: "ຝ່າຍບຸກຄະລາກອນໄດ້ຮັບໃບສະໝັກຂອງທ່ານແລ້ວ ແລະ ຈະຕິດຕໍ່ກັບຄືນທາງອີເມວ ຫຼື ເບີໂທທີ່ທ່ານໃຫ້ໄວ້",
    doneBtn: "ຮັບຊາບ"
  },
  en: {
    docTitle: "Careers at SSMI — Apply by department",
    brand: "SSMI — Sinsub Muang Nuea",
    navAll: "All departments",
    heroEyebrow: "Careers at SSMI Sinsub Muang Nuea",
    heroTitle: 'Choose the right team, <span class="grad">find the role</span> that fits you',
    heroSub: "Explore every department in our microfinance institution, review responsibilities and open positions, then apply directly from this page.",
    statDepts: "Departments",
    statOpen: "Open headcount",
    branchTitle: "Choose a branch",
    branchSub: n => `${n} branches in total — pick one to see the positions open there`,
    branchLabel: "Branch",
    dirTitle: "Departments",
    dirSub: "Click a card to see details and open positions",
    nDuties: n => `${n} key duties`,
    openN: n => `${n} open position${n > 1 ? "s" : ""}`,
    openZero: "No openings yet",
    seatsN: n => `${n} opening${n > 1 ? "s" : ""}`,
    listedN: n => `${n} position${n > 1 ? "s" : ""} at this branch`,
    back: "← Back to all departments",
    openPositions: "Open positions",
    respTitle: "Department responsibilities",
    posTitle: "Positions at this branch",
    posEmpty: "This department has no openings right now. If you'd like to work with us in the future, you can submit your profile in advance.",
    applyGeneral: "Leave your profile with this department",
    generalTitle: "General application",
    applyBtn: "Apply for this role",
    closedTag: "Not open yet",
    applyClosedBtn: "Submit profile in advance",
    dutiesN: n => `Detailed duties (${n} items)`,
    applyFor: t => `Apply for: ${t}`,
    fName: 'Full name <em>*</em>',
    fEmail: 'Email <em>*</em>',
    fPhone: 'Phone number <em>*</em>',
    formNote: "When you submit, your information is saved to our system and HR is notified automatically.",
    submit: "Submit application",
    selectPlaceholder: "— Select —",
    footerBrand: "SSMI Sinsub Muang Nuea",
    footerNote: "Applicant information is sent directly to Human Resources for review.",
    loading: "Loading departments...",
    errNotConfigured: "Firebase is not configured yet — see README.md",
    errCore: "Please fill in your name, email and phone number",
    errNeedFile: label => `Please attach a file: ${label}`,
    errFileSize: label => `"${label}" must be under 5MB`,
    errNeedField: label => `Please fill in: ${label}`,
    sending: "Submitting your application...",
    sent: "Application submitted — thank you for your interest!",
    navOpen: "Open Positions",
    openingsTitle: "All Open Positions",
    openingsSub: "Browse all available roles across all branches and departments ready for your application.",
    sendFailed: "Something went wrong while submitting. Please try again.",
    stepOf: (a, b) => `Step ${a} of ${b}`,
    stepDefault: n => `Section ${n}`,
    nextStep: "Next →",
    prevStep: "← Back",
    confirmClose: "You have unsaved input. Close this form?\n\n(Your answers are kept on this device so you can continue later — attached files must be re-selected.)",
    draftRestored: "We restored the answers you had already typed (files must be re-attached).",
    draftClear: "Clear and start over",
    draftSaved: "Draft saved on this device",
    confirmClearDraft: "Clear everything you have typed and start over?",
    sendingTitle: "Sending your application",
    sendingSub: "Please keep this page open until it finishes",
    uploadingFile: (i, n, name) => `Uploading attachment ${i}/${n} — ${name}`,
    savingData: "Saving your details...",
    doneTitle: "Application sent",
    doneSub: "We hope to work with you soon! 🎉",
    doneNote: "Our HR team has received your application and will get back to you by email or phone.",
    doneBtn: "Got it"
  }
};

let LANG = localStorage.getItem("ssmi-lang") || "la";
const t = key => I18N[LANG][key];

/* ເນື້ອໃນຈາກ Firestore: ໃຊ້ຟິວ *_en ຖ້າມີ ແລະ ກຳລັງເປີດພາສາອັງກິດ */
function tr(obj, base){
  if(LANG === "en" && obj && obj[base + "_en"]) return obj[base + "_en"];
  return obj ? obj[base] : "";
}
function trList(obj, base){
  if(LANG === "en" && Array.isArray(obj?.[base + "_en"]) && obj[base + "_en"].length) return obj[base + "_en"];
  return obj?.[base] || [];
}

/* ອັບເດດຂໍ້ຄວາມ static ໃນ index.html (header/footer/modal) ຕາມພາສາ */
function applyStaticI18n(){
  document.documentElement.lang = LANG === "en" ? "en" : "lo";
  document.title = t("docTitle");
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const val = t(el.dataset.i18n);
    if(typeof val === "string") el.innerHTML = val;
  });
  document.querySelectorAll("[data-lang-opt]").forEach(el => {
    el.classList.toggle("is-active", el.dataset.langOpt === LANG);
  });
  document.getElementById("lang-toggle").setAttribute(
    "aria-label",
    LANG === "la" ? "ປ່ຽນເປັນພາສາອັງກິດ (switch to English)" : "Switch to Lao (ປ່ຽນເປັນພາສາລາວ)"
  );
}

document.getElementById("lang-toggle").addEventListener("click", () => {
  LANG = LANG === "la" ? "en" : "la";
  localStorage.setItem("ssmi-lang", LANG);
  applyStaticI18n();
  route(); // ແປງໜ້າປັດຈຸບັນຄືນໃໝ່
});


/* ========================================================================== */

const app = document.getElementById("app");
document.getElementById("year").textContent = new Date().getFullYear();

function totalOpenPositions(branch = currentBranch()){
  return DEPARTMENTS.reduce((sum, d) => sum + branchOpenPositions(d, branch).length, 0);
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}

/* ---------------- Branch tabs (shared between directory & detail views) ---------------- */
/* ---------------- Branch tabs (shared between directory & detail views) ---------------- */
function branchTabsHtml(){
  if(!BRANCHES.length) return "";
  const activeId = currentBranch()?.id;
  return `
    <section class="relative pb-10 sm:pb-12">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="mb-4 sm:mb-5">
          <h2 class="font-display text-lg font-bold text-slate-900 sm:text-xl">${t("branchTitle")}</h2>
          <p class="mt-1 text-sm text-slate-500">${t("branchSub")(BRANCHES.length)}</p>
        </div>
        
        <!-- รูปแบบ Dropdown สำหรับมือถือ (แสดงเฉพาะจอมือถือ) -->
        <div class="block sm:hidden relative mt-2">
          <!-- เปลี่ยนสีกรอบเป็นสีน้ำเงินอ่อน (border-indigo-300) และเพิ่มเงา/พื้นหลังให้ดูมีมิติ -->
          <select data-branch-select class="w-full appearance-none rounded-xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 px-4 py-3.5 pr-12 text-sm font-bold text-indigo-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20">
            ${BRANCHES.map(b => `
              <option value="${escapeHtml(b.id)}" ${b.id === activeId ? "selected" : ""}>
                ${escapeHtml(tr(b, "name"))}
              </option>
            `).join("")}
          </select>
          
          <!-- ไอคอนลูกศรชี้ลง (Pointer) เพื่อให้รู้ว่ากดเลือก (Dropdown) ได้แน่ๆ -->
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-500">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </div>

        <!-- รูปแบบปุ่ม Tabs สำหรับ Desktop (ซ่อนบนมือถือ) -->
        <div class="hidden sm:flex flex-wrap gap-2.5">
          ${BRANCHES.map(b => `
            <button type="button" data-branch-tab="${escapeHtml(b.id)}" class="rounded-full border px-4 py-2 text-sm font-bold transition-all duration-200 ${b.id === activeId
              ? "border-indigo-500 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30"
              : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-600"
            }">${escapeHtml(tr(b, "name"))}</button>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function bindBranchTabs(){
  // ฟังก์ชันส่วนกลางสำหรับอัปเดตสาขาเมื่อมีการเปลี่ยน
  const updateBranch = (id) => {
    if(id === currentBranchId) return;
    currentBranchId = id;
    localStorage.setItem("ssmi-branch", currentBranchId);
    route({ keepScroll: true });
  };

  // ดักจับ Event สำหรับปุ่ม Tabs
  app.querySelectorAll("[data-branch-tab]").forEach(btn => {
    btn.addEventListener("click", () => updateBranch(btn.dataset.branchTab));
  });

  // ดักจับ Event สำหรับ Dropdown มือถือ
  app.querySelectorAll("[data-branch-select]").forEach(select => {
    select.addEventListener("change", (e) => updateBranch(e.target.value));
  });
}

/* ---------------- Directory view ---------------- */
/* ---------------- Directory view ---------------- */
function renderDirectory(){
  const branch = currentBranch();
  const totalOpen = branchTotalSeats(branch);

  const activeDepts = DEPARTMENTS
    .filter(d => branchListedPositions(d, branch).length > 0)
    .sort((a, b) => {
      const openA = branchOpenPositions(a, branch).length > 0;
      const openB = branchOpenPositions(b, branch).length > 0;
      return (openA === openB) ? 0 : openA ? -1 : 1;
    });

  app.innerHTML = `
    <section class="relative overflow-hidden py-14 sm:py-20 lg:py-28">
      <div class="pointer-events-none absolute -left-24 -top-24 h-96 w-96 animate-blob rounded-full bg-indigo-400/30 blur-3xl"></div>
      <div class="pointer-events-none absolute -right-10 top-10 h-96 w-96 animate-blob rounded-full bg-fuchsia-400/20 blur-3xl" style="animation-delay:4s"></div>
      <div class="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 animate-blob rounded-full bg-purple-300/20 blur-3xl" style="animation-delay:8s"></div>

      <div class="relative mx-auto max-w-6xl px-4 sm:px-6">
        <p class="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-indigo-600 sm:mb-6">
          <span class="h-2 w-2 animate-pulse rounded-full bg-indigo-500"></span>
          ${t("heroEyebrow")}
        </p>
        <h1 class="max-w-3xl font-display text-3xl font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.1] lg:text-6xl">${t("heroTitle")}</h1>
        <p class="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:mt-6 sm:text-lg">${t("heroSub")}</p>

        <div class="mt-8 flex flex-wrap gap-3 sm:mt-10 sm:gap-4">
          <div class="flex-1 min-w-[140px] rounded-2xl border border-white/60 bg-white/70 px-5 py-4 shadow-xl shadow-indigo-500/10 backdrop-blur-xl sm:flex-none sm:px-7 sm:py-5">
            <b class="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text font-display text-2xl font-extrabold text-transparent sm:text-3xl">${activeDepts.length}</b>
            <span class="text-sm font-medium text-slate-500">${t("statDepts")}</span>
          </div>
          
          <!-- เปลี่ยนจากปุ่ม Button เป็นลิงก์ (a href="#/openings") พาไปหน้าใหม่เลย -->
          <a href="#/openings" class="block group flex-1 min-w-[140px] cursor-pointer rounded-2xl border border-white/60 bg-white/70 px-5 py-4 text-left shadow-xl shadow-indigo-500/10 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-2xl sm:flex-none sm:px-7 sm:py-5">
            <b class="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text font-display text-2xl font-extrabold text-transparent transition-transform duration-300 group-active:scale-95 sm:text-3xl">${totalOpen}</b>
            <span class="text-sm font-medium text-slate-500">${t("statOpen")}</span>
          </a>
        </div>
      </div>
    </section>

    ${branchTabsHtml()}

    <section id="departments-grid" class="relative pb-16 sm:pb-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="mb-8 sm:mb-10">
          <h2 class="font-display text-2xl font-bold text-slate-900 sm:text-3xl">${t("dirTitle")}</h2>
          <p class="mt-1 text-slate-500">${t("dirSub")}</p>
        </div>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          ${activeDepts.length > 0 
            ? activeDepts.map(d => deptCard(d)).join("")
            : `<div class="col-span-full rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm font-semibold text-slate-400">ປັດຈຸບັນຍັງບໍ່ມີຕຳແໜ່ງເປີດຮັບໃນແຂວງນີ້ <br>(ไม่มีตำแหน่งเปิดรับในสาขานี้)</div>`
          }
        </div>
      </div>
    </section>
  `;
  bindBranchTabs();
  
  // สคริปต์วาร์ปหายไปแล้วครับ!
}

function deptCard(d){
  const branch = currentBranch();
  const openPos = branchOpenPositions(d, branch);
  const totalSeats = openPos.reduce((sum, p) => sum + getPositionHeadcount(branch, p), 0);
  
  // ดึงวันที่ปิดรับสมัครของทุกตำแหน่งในแผนกนี้ที่เปิดรับอยู่ แล้วหาตัวที่ใกล้วันหมดอายุที่สุด (Earliest deadline)
  const deadlines = openPos.map(p => getPositionDeadline(branch, p)).filter(Boolean).sort();
  const earliestDeadline = deadlines[0]; // เอาวันที่ใกล้สุดมาแสดง

  // เพิ่ม js-open-dept ให้กับแผนกที่มีคนเปิดรับ
  return `
    <a class="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md transition-all duration-300 ease-in-out hover:-translate-y-2 hover:scale-[1.02] hover:border-indigo-300 hover:shadow-2xl hover:shadow-indigo-500/20 ${totalSeats > 0 ? "js-open-dept" : ""}" href="#/dept/${d.id}">

      <!-- ຮູບປະກອບພະແນກ + ລະຫັດພະແນກວາງທັບເທິງຮູບ -->
      <div class="relative h-36 w-full shrink-0 overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500">
        <img src="${escapeHtml(departmentImage(d))}" alt="${escapeHtml(tr(d, "name"))}" loading="lazy" decoding="async"
             class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
             onerror="this.style.display='none'">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/55 via-slate-900/10 to-transparent"></div>
        <span class="absolute left-4 top-4 inline-flex w-fit items-center rounded-full bg-white/95 px-3 py-1 font-mono text-[0.68rem] font-bold tracking-widest text-indigo-600 shadow-sm backdrop-blur">${escapeHtml(d.code || "")}</span>
        ${totalSeats > 0 ? `<span class="absolute right-4 top-4 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">${t("seatsN")(totalSeats)}</span>` : ""}
      </div>

      <div class="flex flex-1 flex-col gap-3 p-6 sm:p-7">
      <span class="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 transition-transform duration-300 group-hover:scale-x-100"></span>
      <h3 class="font-display text-lg font-bold text-slate-900 transition-colors duration-300 group-hover:text-indigo-600">${escapeHtml(tr(d, "name"))}</h3>
      <p class="line-clamp-3 text-sm text-slate-500">${escapeHtml(tr(d, "mission"))}</p>
      
      <div class="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-4 text-xs">
        <div class="flex items-center justify-between gap-3">
          <span class="text-slate-400">${t("nDuties")(trList(d, "responsibilities").length)}</span>
          <span class="font-bold ${totalSeats === 0 ? "text-slate-400" : "text-emerald-600"}">${totalSeats > 0 ? t("seatsN")(totalSeats) : t("openZero")}</span>
        </div>
        
        <!-- แสดงวันที่ปิดรับสมัคร (ถ้ามีตั้งค่าไว้ในหลังบ้าน) -->
        ${earliestDeadline && totalSeats > 0 ? `
          <div class="text-right text-[10px] font-semibold text-rose-500">
            ⏳ ປິດຮັບ: ${escapeHtml(earliestDeadline)}
          </div>
        ` : ""}
      </div>
      </div>
    </a>
  `;
}

/* ---------------- Department detail view ---------------- */
function deptSidebarItem(d, active){
  const openN = branchOpenPositions(d).length;
  const listedN = branchListedPositions(d).length;
  return `
    <a class="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1 rounded-xl px-3 py-2.5 transition-all duration-200 ${active ? "bg-gradient-to-r from-indigo-50 to-purple-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"}" href="#/dept/${d.id}">
      <span class="inline-flex w-fit items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[0.6rem] font-bold tracking-widest text-indigo-600">${escapeHtml(d.code || "")}</span>
      <span class="truncate text-sm font-semibold ${active ? "text-indigo-700" : "text-slate-700"}">${escapeHtml(tr(d, "name"))}</span>
      <span class="col-start-2 text-[0.72rem] font-semibold ${openN === 0 ? "text-slate-400" : "text-emerald-600"}">${openN > 0 ? t("openN")(openN) : t("openZero")}</span>
    </a>
  `;
}

/* ---------------- Department detail view ---------------- */
function renderDetail(deptId){
  const d = DEPARTMENTS.find(x => x.id === deptId);
  if(!d){ renderDirectory(); return; }
  const branch = currentBranch();

  if (branchListedPositions(d, branch).length === 0) {
    const firstAvailableDept = DEPARTMENTS.find(dept => branchListedPositions(dept, branch).length > 0);
    if (firstAvailableDept) {
      location.hash = `#/dept/${firstAvailableDept.id}`;
    } else {
      location.hash = `#/`;
    }
    return;
  }
  
  const positions = (d.positions || [])
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => hasPositionInBranch(branch, p))
    .sort((a, b) => {
      const openA = isPositionOpenInBranch(branch, a.p);
      const openB = isPositionOpenInBranch(branch, b.p);
      return (openA === openB) ? 0 : openA ? -1 : 1;
    });
    
  const resp = trList(d, "responsibilities");
  const activeDeptsSidebar = DEPARTMENTS.filter(dept => branchListedPositions(dept, branch).length > 0);

  app.innerHTML = `
    ${branchTabsHtml()}
    <section class="py-8 sm:py-14">
      <div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 sm:gap-8 sm:px-6 lg:grid-cols-[272px_1fr]">
        
        <aside class="order-2 lg:order-1 lg:sticky lg:top-24 lg:self-start">
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <h2 class="mb-3 px-1 font-display text-xs font-bold uppercase tracking-widest text-slate-400">${t("dirTitle")}</h2>
            <nav class="flex max-h-56 flex-col gap-1 overflow-y-auto lg:max-h-none lg:overflow-visible">
              ${activeDeptsSidebar.map(dept => deptSidebarItem(dept, dept.id === deptId)).join("")}
            </nav>
          </div>
        </aside>

        <div class="order-1 min-w-0 lg:order-2">
          <a href="#/" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors duration-200 hover:text-indigo-600">${t("back")}</a>
          <div class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div>
              <span class="inline-flex w-fit items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-mono text-[0.68rem] font-bold tracking-widest text-indigo-600">${escapeHtml(d.code || "")}</span>
              <h1 class="mt-3 font-display text-2xl font-extrabold text-slate-900 sm:text-3xl lg:text-4xl">${escapeHtml(tr(d, "name"))}</h1>
              <p class="mt-3 max-w-2xl text-slate-600">${escapeHtml(tr(d, "mission"))}</p>
            </div>
            
            <!-- เปลี่ยนจากปุ่ม เป็นลิงก์พาไปหน้า openings แทนเช่นกัน -->
            <a href="#/openings" class="group flex shrink-0 cursor-pointer items-center gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 px-6 py-4 text-center shadow-md transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/20 sm:flex-col sm:gap-0">
              <b class="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text font-display text-3xl font-extrabold text-transparent transition-transform duration-300 group-active:scale-95">${positions.filter(({ p }) => isPositionOpenInBranch(branch, p)).length}</b>
              <span class="text-xs font-semibold text-indigo-500">${t("openPositions")}</span>
            </a>
          </div>

          <div class="flex flex-col gap-6">
            <!-- 1. ส่วนการ์ดตำแหน่งงาน (ขยายเต็มขอบ และนำขึ้นมาก่อน) -->
            <div id="positions-container" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-500 sm:p-6 w-full">
              <h4 class="mb-4 font-display text-base font-bold text-slate-900">${t("posTitle")}</h4>
              <div class="flex flex-col gap-4">
                ${positions.length
                  ? positions.map(({ p, i }) => positionCard(d, p, i)).join("")
                  : `
                    <div class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                      <span class="text-sm text-slate-400">${t("posEmpty")}</span>
                      <button class="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/40 sm:w-auto" data-apply-general="${d.id}">${t("applyGeneral")}</button>
                    </div>
                  `
                }
              </div>
            </div>

            <!-- 2. ส่วนหน้าที่รับผิดชอบ (ย้ายลงมาไว้ด้านล่าง) -->
            <div class="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 w-full">
              <details class="group marker:content-none">
                <summary class="flex cursor-pointer items-center justify-between font-display text-base font-bold text-slate-900 transition-colors duration-200 hover:text-indigo-600">
                  ${t("respTitle")}
                  <span class="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-300 group-open:rotate-180 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                  </span>
                </summary>
                <ul class="details-content mt-4 space-y-3 border-t border-slate-100 pt-4">
                  ${resp.map(r => `<li class="relative pl-5 text-sm text-slate-600 before:absolute before:left-0 before:top-2 before:h-0.5 before:w-3 before:rounded-full before:bg-gradient-to-r before:from-indigo-500 before:to-purple-500">${escapeHtml(r)}</li>`).join("")}
                </ul>
              </details>
            </div>
          </div>

            
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  `;
  bindBranchTabs();

  app.querySelectorAll("[data-apply]").forEach(btn => {
    btn.addEventListener("click", () => {
      openApplyModal(d, d.positions[Number(btn.dataset.apply)]);
    });
  });
  app.querySelectorAll("[data-apply-general]").forEach(btn => {
    btn.addEventListener("click", () => {
      openApplyModal(d, { title: t("generalTitle"), type: "-" });
    });
  });
}

/* ==========================================================================
   ຮູບປະກອບຂອງແຕ່ລະຕຳແໜ່ງ
   ລຳດັບການເລືອກຮູບ:
     1. ຮູບທີ່ຕັ້ງເອງໃນ admin (p.image / p.imageUrl / p.photo) — ໃສ່ລິ້ງຮູບໄດ້ເລີຍ
     2. ຈັບຄູ່ອັດຕະໂນມັດຈາກຄຳໃນຊື່ຕຳແໜ່ງ / ປະເພດ / ຊື່ພະແນກ
     3. ຖ້າບໍ່ກົງກັບຄຳໃດເລີຍ ໃຊ້ຮູບຫ້ອງການທົ່ວໄປ (ສຸ່ມແບບຄົງທີ່ ຕຳແໜ່ງດຽວກັນໄດ້ຮູບເດີມສະເໝີ)
   ຮູບທັງໝົດມາຈາກ Unsplash (ໃຊ້ຟຣີ ລວມທັງທາງການຄ້າ ບໍ່ຕ້ອງໃສ່ເຄຣດິດ)
   ========================================================================== */
const UNSPLASH = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;

/* ຄຳຄົ້ນ → ຮູບ (ຮອງຮັບທັງລາວ ໄທ ແລະ ອັງກິດ) */
const POSITION_IMAGE_RULES = [
  { keys: ["ບໍລິການລູກຄ້າ", "ໜ້າສິນ", "ໜ້າຮ້ານ", "ເຄົາເຕີ", "ບໍລິການ", "ລູກຄ້າ", "บริการ", "ลูกค้า",
           "teller", "customer", "service", "counter", "front"],            id: "1656189368832-43a6dd24f18f" },
  { keys: ["ສິນເຊື່ອ", "ໜີ້ສິນ", "ເງິນກູ້", "ກູ້ຢືມ", "ຕິດຕາມໜີ້", "ສິນຄ້າ", "สินเชื่อ", "หนี้",
           "credit", "loan", "collection", "debt"],                          id: "1601597111158-2fceff292cdc" },
  { keys: ["ບັນຊີ", "ການເງິນ", "ເງິນສົດ", "ຄັງເງິນ", "ກວດສອບ", "ພາສີ", "บัญชี", "การเงิน",
           "account", "finance", "cash", "audit", "treasur"],                id: "1560264418-c4445382edbc" },
  { keys: ["ໄອທີ", "ຄອມພິວເຕີ", "ໂປຣແກຣມ", "ລະບົບ", "ເຕັກໂນໂລຊີ", "ໄອຊີທີ", "ไอที", "โปรแกรม",
           "it", "ict", "developer", "program", "software", "system", "tech", "data"], id: "1553877522-43269d4ea984" },
  { keys: ["ການຕະຫຼາດ", "ຂາຍ", "ສົ່ງເສີມ", "ໂຄສະນາ", "ຕະຫຼາດ", "การตลาด", "ขาย",
           "market", "sale", "promot", "brand", "digital"],                  id: "1522071820081-009f0129c71c" },
  { keys: ["ບຸກຄະລາກອນ", "ຊັບພະຍາກອນມະນຸດ", "ຝຶກອົບຮົມ", "ບຸກຄົນ", "บุคคล", "ทรัพยากรมนุษย์",
           "hr", "human", "recruit", "training", "people"],                  id: "1511376979163-f804dff7ad7b" },
  { keys: ["ຜູ້ຈັດການ", "ຫົວໜ້າ", "ຮອງ", "ຜູ້ອຳນວຍການ", "ບໍລິຫານ", "ຍຸດທະສາດ", "ผู้จัดการ", "หัวหน้า",
           "manager", "head", "director", "chief", "lead", "supervisor", "strateg"], id: "1622675363311-3e1904dc1885" },
  { keys: ["ທຸລະການ", "ເອກະສານ", "ຫ້ອງການ", "ຈັດຊື້", "ພັດສະດຸ", "ธุรการ", "เอกสาร",
           "admin", "office", "document", "clerk", "procure"],               id: "1568992687947-868a62a9f521" },
  { keys: ["ກົດໝາຍ", "ນິຕິກຳ", "ສັນຍາ", "ກົດລະບຽບ", "กฎหมาย", "นิติกรรม",
           "legal", "law", "compliance", "contract", "risk"],                id: "1600880292203-757bb62b4baf" },
  { keys: ["ສາຂາ", "ໜ່ວຍບໍລິການ", "ສຳນັກງານ", "ສາຂາຍ່ອຍ", "สาขา",
           "branch", "office manager"],                                      id: "1684679674829-fc7b436ec8e8" }
];

/* ຮູບສຳຮອງ ສຳລັບຕຳແໜ່ງທີ່ບໍ່ກົງກັບຄຳໃດເລີຍ */
const FALLBACK_IMAGE_IDS = [
  "1541746972996-4e0b0f43e02a",
  "1568992688065-536aad8a12f6",
  "1603201667141-5a2d4c673378",
  "1606836591695-4d58a73eba1e",
  "1556761175-b413da4baf72",
  "1629904853716-f0bc54eea481",
  "1522202176988-66273c2fd55f",
  "1551434678-e076c223a692"
];

/* ຕົວເລກຄົງທີ່ຈາກຂໍ້ຄວາມ — ຕຳແໜ່ງດຽວກັນຈະໄດ້ຮູບເດີມທຸກຄັ້ງ ບໍ່ປ່ຽນໄປມາ */
function stableHash(str){
  let h = 0;
  for(let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/* ຮູບຂອງ "ພະແນກ" ສຳລັບບັດໃນໜ້າລວມ
   ໃຊ້ຮູບຂອງຕຳແໜ່ງທຳອິດໃນພະແນກທີ່ໃສ່ຮູບເອງໄວ້ ຖ້າບໍ່ມີກໍ່ຈັບຄູ່ຈາກຊື່ພະແນກ */
function departmentImage(d){
  const custom = (d.image || d.imageUrl || "").trim();
  if(custom) return custom;

  const withImage = (d.positions || []).find(p => (p.image || p.imageUrl || p.photo || "").trim());
  if(withImage) return (withImage.image || withImage.imageUrl || withImage.photo).trim();

  /* ບໍ່ມີຮູບທີ່ຕັ້ງເອງເລີຍ — ໃຫ້ຈັບຄູ່ອັດຕະໂນມັດຈາກຊື່ພະແນກ */
  return positionImage({ id: d.id || d.code, title: tr(d, "name"), type: "" }, d);
}

function positionImage(p, d){
  /* 1. ຮູບທີ່ຕັ້ງເອງຈາກ admin */
  const custom = (p.image || p.imageUrl || p.photo || "").trim();
  if(custom) return custom;

  /* 2. ຈັບຄູ່ຈາກຄຳສຳຄັນ */
  const hay = [
    p.title, p.title_en, p.type, p.type_en, p.description,
    d?.name, d?.name_en, d?.code
  ].filter(Boolean).join(" ").toLowerCase();

  for(const rule of POSITION_IMAGE_RULES){
    if(rule.keys.some(k => hay.includes(k.toLowerCase()))) return UNSPLASH(rule.id);
  }

  /* 3. ຮູບສຳຮອງ */
  const seed = stableHash(p.id || p.title || "x");
  return UNSPLASH(FALLBACK_IMAGE_IDS[seed % FALLBACK_IMAGE_IDS.length]);
}

/* ກ່ອງຮູບ — ມີພື້ນສີໄລ່ເສີຍໄວ້ດ້ານຫຼັງ ຖ້າໂຫຼດຮູບບໍ່ໄດ້ກໍ່ຍັງສວຍຢູ່ */
function coverHtml(p, d, extraClass = "", badgeHtml = ""){
  const url = positionImage(p, d);
  const alt = escapeHtml(tr(p, "title") || "");
  return `
    <div class="relative shrink-0 overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 ${extraClass}">
      <img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" decoding="async"
           class="h-full w-full object-cover transition-transform duration-700 group-hover/card:scale-105 group-hover:scale-105"
           onerror="this.style.display='none'">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/45 via-slate-900/5 to-transparent"></div>
      ${badgeHtml}
    </div>`;
}

function positionCard(d, p, i){
  const duties = trList(p, "duties");
  const branch = currentBranch();
  const opened = isPositionOpenInBranch(branch, p);
  const headcount = getPositionHeadcount(branch, p);
  const deadline = getPositionDeadline(branch, p); // ดึงวันที่ปิดรับ
  const opening = (branch.openings || []).find(op => op.posId === p.id);
  let genderText = "";
  if (opening && headcount > 0) {
    const parts = [];
    if (opening.countM > 0) parts.push(`ຊາຍ ${opening.countM}`);
    if (opening.countF > 0) parts.push(`ຍິງ ${opening.countF}`);
    if (opening.countAny > 0) parts.push(`ຊາຍ/ຍິງ ${opening.countAny}`);
    if (parts.length > 0) {
      genderText = ` (${parts.join(", ")})`;
    }
  }
  return `
    <div class="group/card overflow-hidden rounded-2xl border ${opened ? "border-indigo-200 bg-white js-open-position" : "border-slate-100 bg-slate-50"} shadow-sm transition-all duration-500 ${opened ? "hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/10" : ""}">
      <div class="flex flex-col sm:flex-row">

        ${coverHtml(p, d, `aspect-square h-40 w-full sm:h-56 sm:w-56 sm:shrink-0 object-cover ${opened ? "" : "grayscale"}`)}

        <div class="min-w-0 flex-1 p-4 sm:p-5">
          <div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h5 class="font-display text-base font-bold text-slate-900">${escapeHtml(tr(p, "title"))}</h5>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">${escapeHtml(tr(p, "type") || p.type || "")}</span>

                ${headcount > 0
    ? `<span class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">${t("seatsN")(headcount)}${genderText}</span>`
    : `<span class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">${t("closedTag")}</span>`}
                <!-- แสดงวันที่ปิดรับสมัครตัวเล็กๆ -->
                ${deadline ? `<span class="text-xs font-medium text-slate-400">📅 ປິດຮັບສະໝັກ: ${escapeHtml(deadline)}</span>` : ""}
              </div>
            </div>
            <button class="w-full ${opened
              ? "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/40"
              : "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-600"
            } sm:w-auto" data-apply="${i}">
              ${opened ? t("applyBtn") : t("applyClosedBtn")}
            </button>
          </div>

          <p class="mt-3 text-sm leading-relaxed text-slate-600">${escapeHtml(tr(p, "description"))}</p>

          ${duties.length ? `
            <details class="group mt-4 border-t border-slate-100 pt-3 marker:content-none">
              <summary class="flex cursor-pointer items-center justify-between text-sm font-semibold text-indigo-600 transition-colors duration-200 hover:text-purple-600">
                ${t("dutiesN")(duties.length)}
                <span class="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-300 group-open:rotate-180 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                  <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                </span>
              </summary>
              <ul class="details-content mt-4 space-y-2">
                ${duties.map(du => `<li class="relative pl-5 text-sm text-slate-600 before:absolute before:left-0 before:top-2 before:h-0.5 before:w-3 before:rounded-full before:bg-gradient-to-r before:from-indigo-500 before:to-purple-500">${escapeHtml(du)}</li>`).join("")}
              </ul>
            </details>
          ` : ""}
        </div>
      </div>
    </div>
  `;
}

const overlay = document.getElementById("apply-overlay");
const form = document.getElementById("apply-form");
const statusEl = document.getElementById("apply-status");
const submitBtn = document.getElementById("apply-submit");
const nextBtn = document.getElementById("apply-next");
const prevBtn = document.getElementById("apply-prev");

function setApplyStatus(msg, kind = "neutral"){
  statusEl.textContent = msg;
  statusEl.className = "text-sm font-semibold " + (
    kind === "ok" ? "text-emerald-600" : kind === "err" ? "text-rose-600" : "text-slate-500"
  );
}

/* render ช่องกรอกเพิ่มเติมตามที่ admin ตั้งค่าไว้ (settings/applicationForm) */
const FIELD_INPUT_CLS = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-all duration-200 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10";
const FIELD_FILE_CLS = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-indigo-600 hover:file:bg-indigo-100";
const FIELD_LABEL_CLS = "mb-1.5 block text-sm font-semibold text-slate-700";

/* ຊື່ປ້າຍຕາມພາສາທີ່ກຳລັງເປີດ */
function fieldLabel(f){
  return (LANG === "en" && f.label_en) ? f.label_en : (f.label_la || f.label || "");
}

/* ຊື່ທີ່ໃຊ້ເກັບລົງຖານຂໍ້ມູນ / ສົ່ງອີເມວ — ອີງພາສາລາວສະເໝີ ເພື່ອໃຫ້ admin ອ່ານງ່າຍ */
function fieldKey(f){
  return f.label_la || f.label || f.label_en || f.id;
}

function customFieldHtml(f){
  const req = f.required ? '<em>*</em>' : "";
  const label = `<span class="${FIELD_LABEL_CLS}">${escapeHtml(fieldLabel(f))} ${req}</span>`;
  const ph = escapeHtml(f.placeholder || "");
  /* ຂໍ້ຄວາມຍາວ (textarea) ໃຫ້ເຕັມແຖວສະເໝີ ບໍ່ດັ່ງນັ້ນຈະເກີດຊ່ອງຫວ່າງຂ້າງໆ */
  const wrap = `block ${(f.width === "full" || f.type === "textarea") ? "sm:col-span-2" : ""}`;
  /* ຊ່ອງລະບົບ: ໃສ່ id ເດີມ (field-name/field-email/field-phone) ແລະ autocomplete ໄວ້ນຳ */
  const coreAttr = f.core
    ? ` id="field-${escapeHtml(f.core)}" data-core="${escapeHtml(f.core)}" autocomplete="${
        f.core === "name" ? "name" : f.core === "email" ? "email" : "tel"}"`
    : "";

  switch(f.type){
    case "textarea":
      return `<label class="${wrap}">${label}<textarea data-field-id="${escapeHtml(f.id)}" rows="4" placeholder="${ph}" class="${FIELD_INPUT_CLS} resize-y"></textarea></label>`;
    case "select": {
      const opts = (f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      return `<label class="${wrap}">${label}<select data-field-id="${escapeHtml(f.id)}" class="${FIELD_INPUT_CLS}"><option value="">${t("selectPlaceholder")}</option>${opts}</select></label>`;
    }
    case "file":
      return `<label class="${wrap}">${label}<input type="file" data-field-id="${escapeHtml(f.id)}" accept="application/pdf" class="${FIELD_FILE_CLS}"></label>`;
    case "image":
      return `<label class="${wrap}">${label}<input type="file" data-field-id="${escapeHtml(f.id)}" accept="image/*" class="${FIELD_FILE_CLS}"></label>`;
    default: { // text, email, tel, url, number, date
      const type = ["email","tel","url","number","date"].includes(f.type) ? f.type : "text";
      return `<label class="${wrap}">${label}<input type="${type}"${coreAttr} data-field-id="${escapeHtml(f.id)}" placeholder="${ph}" class="${FIELD_INPUT_CLS}"></label>`;
    }
  }
}

/* ຟອມທັງໝົດ (ລວມຊື່/ອີເມວ/ເບີໂທ) ຖືກສ້າງຈາກການຕັ້ງຄ່າໃນໜ້າ admin — ບໍ່ມີຊ່ອງໃດ hard-code ໃນ HTML */
/* ==========================================================================
   ຟອມແບບຫຼາຍຂັ້ນຕອນ — ແບ່ງໜ້າຕາມຄ່າ step ຂອງແຕ່ລະຊ່ອງ (ຕັ້ງໃນໜ້າ admin)
   ທຸກໜ້າຖືກ render ໄວ້ໃນ DOM ພ້ອມກັນ ແລ້ວເຊື່ອງໄວ້ ຄ່າທີ່ກອກແລ້ວຈຶ່ງບໍ່ຫາຍ
   ========================================================================== */
let STEPS = [];
let stepIndex = 0;

function buildSteps(){
  const map = new Map();
  (FORM_FIELDS || []).forEach(f => {
    const n = Math.max(1, Math.min(9, Number(f.step) || 1));
    if(!map.has(n)) map.set(n, []);
    map.get(n).push(f);
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, fields], i) => ({
      n, fields,
      title: (STEP_TITLES[n - 1] || "").trim() || t("stepDefault")(i + 1)
    }));
}

function renderCustomFields(){
  STEPS = buildSteps();
  stepIndex = 0;
  document.getElementById("custom-fields").innerHTML = STEPS.map((st, i) => `
    <div data-step-panel="${i}" class="grid grid-cols-1 items-start gap-4 sm:grid-cols-2" ${i === 0 ? "" : "hidden"}>
      ${st.fields.map(customFieldHtml).join("")}
    </div>`).join("");
  updateStepUi();
}

function updateStepUi(){
  const head = document.getElementById("form-steps");
  const multi = STEPS.length > 1;
  head.hidden = !multi;
  if(multi){
    head.innerHTML = `
      <div class="flex items-baseline justify-between gap-3">
        <h3 class="font-display text-base font-bold text-slate-900">${escapeHtml(STEPS[stepIndex].title)}</h3>
        <span class="shrink-0 font-mono text-xs font-bold text-indigo-600">${t("stepOf")(stepIndex + 1, STEPS.length)}</span>
      </div>
      <div class="flex gap-1.5">
        ${STEPS.map((s, i) => `<span class="h-1.5 flex-1 rounded-full transition-colors duration-300 ${
          i <= stepIndex ? "bg-gradient-to-r from-indigo-500 to-purple-500" : "bg-slate-200"}"></span>`).join("")}
      </div>`;
  }

  form.querySelectorAll("[data-step-panel]").forEach(p => {
    p.hidden = Number(p.dataset.stepPanel) !== stepIndex;
  });

  const isLast = stepIndex >= STEPS.length - 1;
  prevBtn.hidden = stepIndex === 0;
  nextBtn.hidden = isLast;
  nextBtn.textContent = t("nextStep");
  prevBtn.textContent = t("prevStep");
  submitBtn.hidden = !isLast;
}

/* ກວດຄວາມຄົບຖ້ວນສະເພາະຊ່ອງໃນຊຸດທີ່ສົ່ງມາ */
function validateFields(fields){
  for(const f of fields){
    const el = form.querySelector(`[data-field-id="${CSS.escape(f.id)}"]`);
    if(!el) continue;
    const lbl = fieldLabel(f);
    if(f.type === "file" || f.type === "image"){
      const file = el.files[0] || null;
      if(f.required && !file) return { msg: t("errNeedFile")(lbl) };
      if(file && file.size > 5 * 1024 * 1024) return { msg: t("errFileSize")(lbl) };
    } else {
      const val = el.value.trim();
      if(f.required && !val) return { msg: t("errNeedField")(lbl), el };
    }
  }
  return null;
}

function gotoStep(i){
  stepIndex = Math.max(0, Math.min(STEPS.length - 1, i));
  updateStepUi();
  setApplyStatus("");
  overlay.scrollTo({ top: 0, behavior: "smooth" });
  form.querySelector("[data-step-panel]:not([hidden]) [data-field-id]")?.focus();
}

nextBtn.addEventListener("click", () => {
  const err = validateFields(STEPS[stepIndex]?.fields || []);
  if(err){
    setApplyStatus(err.msg, "err");
    err.el?.focus();
    return;
  }
  gotoStep(stepIndex + 1);
});

prevBtn.addEventListener("click", () => gotoStep(stepIndex - 1));

function coreInput(key){
  return form.querySelector(`[data-core="${key}"]`);
}

/* ==========================================================================
   ໜ້າຈໍ "ກຳລັງສົ່ງ" / "ສົ່ງສຳເລັດ"
   ກັນຜູ້ສະໝັກປິດໜ້າຕ່າງລະຫວ່າງທີ່ຂໍ້ມູນຍັງສົ່ງບໍ່ທັນຮອດ
   ========================================================================== */
const submitOverlay = document.getElementById("submit-overlay");
let isSending = false;

function showSending(){
  isSending = true;
  document.getElementById("submit-sending").hidden = false;
  document.getElementById("submit-done").hidden = true;
  document.getElementById("submit-sending-title").textContent = t("sendingTitle");
  document.getElementById("submit-sending-sub").textContent = t("sendingSub");
  submitOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function setSendingStep(msg){
  const el = document.getElementById("submit-sending-sub");
  if(el) el.textContent = msg;
}

function showDone(){
  isSending = false;
  document.getElementById("submit-sending").hidden = true;
  const done = document.getElementById("submit-done");
  done.hidden = false;
  document.getElementById("submit-done-title").textContent = t("doneTitle");
  document.getElementById("submit-done-sub").textContent = t("doneSub");
  document.getElementById("submit-done-note").textContent = t("doneNote");
  document.getElementById("submit-done-btn").textContent = t("doneBtn");
  submitOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("submit-done-btn").focus();
}

function hideSubmitOverlay(){
  isSending = false;
  submitOverlay.hidden = true;
  document.body.style.overflow = "";
}

document.getElementById("submit-done-btn").addEventListener("click", hideSubmitOverlay);

let applyingToOpenPosition = true;

/* ==========================================================================
   ຮ່າງໃບສະໝັກ (draft) — ເກັບໄວ້ໃນເຄື່ອງຜູ້ໃຊ້ດ້ວຍ localStorage
   ເນື່ອງຈາກຜູ້ສະໝັກບໍ່ຕ້ອງລ໋ອກອິນ ຈຶ່ງເກັບເປັນຮ່າງໃນ browser ຂອງເຂົາເອງ
   ຂໍ້ຈຳກັດ: ໄຟລ໌ແນບເກັບບໍ່ໄດ້ (browser ບໍ່ອະນຸຍາດ) ຕ້ອງເລືອກໃໝ່
   ========================================================================== */
const DRAFT_KEY = "ssmi-apply-draft-v1";
const DRAFT_TTL = 30 * 24 * 60 * 60 * 1000;   // ເກັບໄວ້ 30 ວັນ

function collectDraftValues(){
  const values = {};
  form.querySelectorAll("[data-field-id]").forEach(el => {
    if(el.type === "file") return;
    const v = (el.value || "").trim();
    if(v) values[el.dataset.fieldId] = el.value;
  });
  return values;
}

function hasAnyInput(){
  return Object.keys(collectDraftValues()).length > 0;
}

function saveDraft(){
  try {
    const values = collectDraftValues();
    if(!Object.keys(values).length){ localStorage.removeItem(DRAFT_KEY); return; }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), values }));
    setApplyStatus(t("draftSaved"));
  } catch (err){ /* ພື້ນທີ່ເຕັມ ຫຼື ປິດ storage ໄວ້ — ຂ້າມໄປ */ }
}

function readDraft(){
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if(!raw || !raw.values) return null;
    if(Date.now() - (raw.savedAt || 0) > DRAFT_TTL){ localStorage.removeItem(DRAFT_KEY); return null; }
    return raw;
  } catch (err){ return null; }
}

function clearDraft(){
  try { localStorage.removeItem(DRAFT_KEY); } catch (err){}
}

function showDraftNote(show){
  const note = document.getElementById("draft-note");
  if(!note) return;
  note.hidden = !show;
  if(show){
    document.getElementById("draft-note-text").textContent = t("draftRestored");
    document.getElementById("draft-clear").textContent = t("draftClear");
  }
}

/* ເອົາຮ່າງທີ່ເກັບໄວ້ມາໃສ່ຄືນໃນຟອມ */
function restoreDraft(){
  const draft = readDraft();
  if(!draft) return false;
  let filled = 0;
  Object.entries(draft.values).forEach(([id, val]) => {
    const el = form.querySelector(`[data-field-id="${CSS.escape(id)}"]`);
    if(!el || el.type === "file") return;
    el.value = val;
    if((el.value || "").trim()) filled++;
  });
  return filled > 0;
}

let draftTimer = null;
form.addEventListener("input", () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 600);
});
form.addEventListener("change", saveDraft);

document.getElementById("draft-clear").addEventListener("click", () => {
  if(!confirm(t("confirmClearDraft"))) return;
  clearDraft();
  form.reset();
  renderCustomFields();
  showDraftNote(false);
  setApplyStatus("");
});

/* ຢືນຢັນກ່ອນປິດ ຖ້າມີການກອກຂໍ້ມູນແລ້ວ */
function requestCloseApplyModal(){
  if(isSending) return;   // ກຳລັງສົ່ງຢູ່ ປິດບໍ່ໄດ້
  if(hasAnyInput()){
    saveDraft();
    if(!confirm(t("confirmClose"))) return;
  }
  closeApplyModal();
}

/* ກັນປິດແທັບ/refresh ຕອນກຳລັງກອກ */
window.addEventListener("beforeunload", e => {
  if(isSending || (!overlay.hidden && hasAnyInput())){
    saveDraft();
    e.preventDefault();
    e.returnValue = "";
  }
});

function openApplyModal(dept, position){
  applyingToOpenPosition = !!position.id && isPositionOpenInBranch(currentBranch(), position);
  const branch = currentBranch();
  const branchName = branch ? tr(branch, "name") : "";
  document.getElementById("apply-dept-label").textContent = branchName
    ? `${tr(dept, "name")} · ${t("branchLabel")}: ${branchName}`
    : tr(dept, "name");
  document.getElementById("apply-title").textContent = t("applyFor")(tr(position, "title") || position.title);
  form.reset();
  
  renderCustomFields();
  
  document.getElementById("field-department").value = dept.name;
  document.getElementById("field-department-id").value = dept.id || "";
  document.getElementById("field-position").value = position.title;
  document.getElementById("field-branch").value = branchName;
  document.getElementById("field-branch-id").value = branch?.id || "";
  setApplyStatus("");
  showDraftNote(restoreDraft());
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  overlay.scrollTop = 0;
  const firstInput = form.querySelector("[data-step-panel]:not([hidden]) [data-field-id]");
  if(firstInput) firstInput.focus();
}

function closeApplyModal(){
  overlay.hidden = true;
  document.body.style.overflow = "";
}

document.getElementById("apply-close").addEventListener("click", requestCloseApplyModal);
overlay.addEventListener("click", e => { if(e.target === overlay) requestCloseApplyModal(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && !overlay.hidden) requestCloseApplyModal(); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if(FIREBASE_NOT_CONFIGURED){
    setApplyStatus(t("errNotConfigured"), "err");
    return;
  }

  const nameVal  = (coreInput("name")?.value  || "").trim();
  const emailVal = (coreInput("email")?.value || "").trim();
  const phoneVal = (coreInput("phone")?.value || "").trim();
  const departmentVal = document.getElementById("field-department").value;
  const departmentIdVal = document.getElementById("field-department-id").value;
  const positionVal = document.getElementById("field-position").value;
  const branchVal = document.getElementById("field-branch").value;
  const branchIdVal = document.getElementById("field-branch-id").value;

  if(!nameVal || !emailVal || !phoneVal){
    setApplyStatus(t("errCore"), "err");
    return;
  }

  /* ກວດທຸກຂັ້ນຕອນກ່ອນສົ່ງ — ຖ້າຂາດຊ່ອງໃດ ໃຫ້ພາກັບໄປໜ້ານັ້ນ */
  for(let i = 0; i < STEPS.length; i++){
    const err = validateFields(STEPS[i].fields);
    if(err){
      if(i !== stepIndex) gotoStep(i);
      setApplyStatus(err.msg, "err");
      err.el?.focus();
      return;
    }
  }

  /* เก็บค่าจากช่องกรอกที่ admin ตั้งค่าไว้ */
  /* เก็บค่าจากช่องกรอกที่ admin ตั้งค่าไว้ */
  const answers = {};          
  const fileUploads = [];      
  for(const f of (FORM_FIELDS || [])){
    const el = form.querySelector(`[data-field-id="${CSS.escape(f.id)}"]`);
    if(!el) continue;
    
    /* 3 ຊ່ອງລະບົບ ຖືກເກັບເປັນ name/email/phone ຢູ່ດ້ານເທິງແລ້ວ ບໍ່ຕ້ອງໃສ່ຊ້ຳໃນ answers */
    if(f.core) continue;

    if(f.type === "file" || f.type === "image"){
      const file = el.files[0] || null;
      if(file) fileUploads.push({ field: f, file });
    } else {
      // บันทึกเข้าฐานข้อมูลโดยอิงจากชื่อภาษาลาว เพื่อให้แอดมินอ่านง่ายเสมอ
      answers[fieldKey(f)] = el.value.trim();
    }
  }

  submitBtn.disabled = true;
  setApplyStatus(t("sending"));
  showSending();

  try {
    const appRef = doc(collection(db, APPLICATIONS_COLLECTION));

    const attachments = [];
    let uploaded = 0;
    for(const { field, file } of fileUploads){
      setSendingStep(t("uploadingFile")(++uploaded, fileUploads.length, file.name));
      const folder = field.type === "image" ? ATTACHMENTS_STORAGE_FOLDER : RESUME_STORAGE_FOLDER;
      const path = `${folder}/${appRef.id}/${field.id}-${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type || "application/pdf" });
      const url = await getDownloadURL(fileRef);
      attachments.push({ label: fieldKey(field), name: file.name, url, path });
    }

    const answerLines = Object.entries(answers)
      .map(([label, val]) => `${label}: ${val || "-"}`).join("\n");
    const attachmentLines = attachments.length
      ? attachments.map(a => `${a.label}: ${a.url}`).join("\n")
      : "ไม่มีไฟล์แนบ";

    const subject = (applyingToOpenPosition ? "ໃບສະໝັກໃໝ່: " : "[ຝາກປະຫວັດ] ") +
      `${positionVal} (${departmentVal}${branchVal ? " — " + branchVal : ""})`;
    const emailText =
      `มีผู้สมัครใหม่\n\n` +
      `ตำแหน่ง: ${positionVal}\n` +
      `แผนก: ${departmentVal}\n` +
      `สาขา: ${branchVal || "-"}\n` +
      `ชื่อ-นามสกุล: ${nameVal}\n` +
      `อีเมล: ${emailVal}\n` +
      `เบอร์โทรศัพท์: ${phoneVal}\n\n` +
      `ข้อมูลเพิ่มเติม:\n${answerLines || "-"}\n\n` +
      `ไฟล์แนบ:\n${attachmentLines}`;

    setSendingStep(t("savingData"));
    await setDoc(appRef, {
      department: departmentVal,
      departmentId: departmentIdVal,
      position: positionVal,
      branch: branchVal,
      branchId: branchIdVal,
      name: nameVal,
      email: emailVal,
      phone: phoneVal,
      answers,
      attachments,
      advanceProfile: !applyingToOpenPosition,
      status: "new",
      submittedAt: serverTimestamp(),
      to: NOTIFY_EMAILS,
      message: { subject, text: emailText }
    });

    setApplyStatus("");
    clearDraft();
    showDraftNote(false);
    form.reset();
    renderCustomFields();     // ກັບໄປໜ້າທຳອິດຂອງຟອມ ພ້ອມສຳລັບຄັ້ງຕໍ່ໄປ
    closeApplyModal();
    showDone();               // 🎉 ຫວັງວ່າຈະໄດ້ຮ່ວມງານກັນ
  } catch (err){
    console.error(err);
    hideSubmitOverlay();
    document.body.style.overflow = "hidden";   // ຟອມຍັງເປີດຢູ່
    setApplyStatus(t("sendFailed"), "err");
  } finally {
    submitBtn.disabled = false;
  }
});


/* ---------------- All Openings View ---------------- */
function renderOpenings(){
  let allOpenings = [];
  BRANCHES.forEach(branch => {
    DEPARTMENTS.forEach(dept => {
      const openPos = branchOpenPositions(dept, branch);
      openPos.forEach(p => {
        const deadline = getPositionDeadline(branch, p); // ดึง deadline
        allOpenings.push({ branch, dept, p, count: getPositionHeadcount(branch, p), deadline });
      });
    });
  });

  app.innerHTML = `
    <section class="relative overflow-hidden py-14 sm:py-20 lg:py-28">
      <div class="pointer-events-none absolute -left-24 -top-24 h-96 w-96 animate-blob rounded-full bg-indigo-400/30 blur-3xl"></div>
      <div class="relative mx-auto max-w-6xl px-4 sm:px-6">
        <a href="#/" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors duration-200 hover:text-indigo-600">${t("back")}</a>
        <h1 class="mt-3 font-display text-3xl font-extrabold text-slate-900 sm:text-5xl">${t("openingsTitle")}</h1>
        <p class="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">${t("openingsSub")}</p>
      </div>
    </section>
    
    <section class="relative pb-16 sm:pb-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          ${allOpenings.length > 0 
            ? allOpenings.map((item, index) => openingCard(item, index)).join("") 
            : `<div class="col-span-full rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm font-semibold text-slate-400">ປັດຈຸບັນຍັງບໍ່ມີຕຳແໜ່ງເປີດຮັບ <br>ສາມາດຝາກປະຫວັດຂອງທ່ານໄວ້ລ່ວງໜ້າ ທີ່ໜ້າຫຼັກ</div>`
          }
        </div>
      </div>
    </section>
  `;

  app.querySelectorAll("[data-apply-global]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.applyGlobal);
      const item = allOpenings[index];
      
      currentBranchId = item.branch.id;
      localStorage.setItem("ssmi-branch", currentBranchId);
      
      openApplyModal(item.dept, item.p);
    });
  });
}

function openingCard(item, index) {
  const duties = trList(item.p, "duties");
  const description = tr(item.p, "description");

  /* ປ້າຍສາຂາ ແລະ ຈຳນວນອັດຕາ ວາງທັບຢູ່ເທິງຮູບ */
  const badges = `
    <div class="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
      <span class="inline-flex items-center rounded-full bg-white/95 px-3 py-1 font-mono text-[0.7rem] font-bold text-indigo-600 shadow-sm backdrop-blur">
        📍 ${escapeHtml(tr(item.branch, "name"))}
      </span>
      <span class="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
        ${t("seatsN")(item.count)}
      </span>
    </div>`;

  return `
    <div class="group flex flex-col overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/20">

      ${coverHtml(item.p, item.dept, "h-44 w-full", badges)}

      <div class="flex flex-1 flex-col justify-between p-6">
        <div>
          <h3 class="font-display text-lg font-bold text-slate-900 group-hover:text-indigo-600">${escapeHtml(tr(item.p, "title"))}</h3>
          <p class="mt-1 text-sm font-semibold text-indigo-500">${escapeHtml(tr(item.dept, "name"))}</p>

          <!-- แสดงวันที่ปิดรับสมัคร -->
          ${item.deadline ? `<p class="mt-2 text-xs font-medium text-slate-400">📅 ປິດຮັບສະໝັກ: ${escapeHtml(item.deadline)}</p>` : ""}

          ${description ? `<p class="mt-3 text-sm leading-relaxed text-slate-600">${escapeHtml(description)}</p>` : ""}

          ${duties.length ? `
            <details class="group mt-4 border-t border-slate-100 pt-3 marker:content-none">
              <summary class="flex cursor-pointer items-center justify-between text-sm font-semibold text-indigo-600 transition-colors duration-200 hover:text-purple-600">
                ${t("dutiesN")(duties.length)}
                <span class="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-300 group-open:rotate-180 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                  <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                </span>
              </summary>
              <ul class="details-content mt-4 space-y-2">
                ${duties.map(du => `<li class="relative pl-5 text-sm text-slate-600 before:absolute before:left-0 before:top-2 before:h-0.5 before:w-3 before:rounded-full before:bg-gradient-to-r before:from-indigo-500 before:to-purple-500">${escapeHtml(du)}</li>`).join("")}
              </ul>
            </details>
          ` : ""}
        </div>

        <div class="mt-6 border-t border-slate-100 pt-4">
          <button type="button" class="w-full inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:scale-105" data-apply-global="${index}">
            ${t("applyBtn")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------- Router ---------------- */
function updateNavState(hash) {
  // ดึงปุ่มเมนูทั้งสองปุ่มมา
  const navAll = document.querySelector('[data-i18n="navAll"]');
  const navOpen = document.querySelector('[data-i18n="navOpen"]');
  if(!navAll || !navOpen) return;

  // กำหนดสีของปุ่มตอนที่ "ถูกเลือก" (มีกรอบสีม่วง ตัวหนา) และ "ไม่ได้เลือก" (สีเทากลืนไปกับพื้น)
  const activeCls = "rounded-full bg-indigo-50 px-3 py-1.5 font-bold text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800".split(" ");
  const inactiveCls = "font-semibold text-slate-600 hover:text-indigo-600".split(" ");

  if(hash === "openings") {
    // ถ้าอยู่หน้า "ตำแหน่งที่เปิดรับ" ให้ไฮไลท์ปุ่ม navOpen
    navOpen.classList.add(...activeCls);
    navOpen.classList.remove(...inactiveCls);
    
    navAll.classList.add(...inactiveCls);
    navAll.classList.remove(...activeCls);
  } else {
    // ถ้าอยู่หน้าแรก หรือหน้าอื่นๆ ให้ไฮไลท์ปุ่ม navAll แทน
    navAll.classList.add(...activeCls);
    navAll.classList.remove(...inactiveCls);
    
    navOpen.classList.add(...inactiveCls);
    navOpen.classList.remove(...activeCls);
  }
}

function route({ keepScroll = false } = {}){
  const scrollY = window.scrollY;
  const hash = location.hash.replace(/^#\/?/, "");
  
  // เรียกใช้ฟังก์ชันสลับสีปุ่มทุกครั้งที่มีการเปลี่ยนหน้า
  updateNavState(hash);
  
  if(hash === "openings"){
    renderOpenings();
  } else if(hash.startsWith("dept/")){
    renderDetail(hash.replace("dept/", ""));
  } else {
    renderDirectory();
  }
  
  window.scrollTo(0, keepScroll ? scrollY : 0);
}

window.addEventListener("hashchange", route);

applyStaticI18n();
app.innerHTML = `<section class="px-6 py-24 text-center text-slate-400"><div class="mx-auto max-w-6xl">${t("loading")}</div></section>`;
Promise.all([loadDepartments(), loadBranches(), loadSettings()]).then(() => {
  applyStaticI18n(); // เรียกอัปเดตภาษา "หลังจาก" โหลดข้อมูลจากหลังบ้านเสร็จแล้ว
  route();
});