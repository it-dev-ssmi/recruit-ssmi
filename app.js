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

/* ຕຳແໜ່ງທີ່ "ເປີດຮັບ" — position ທີ່ບໍ່ມີຟິວ open ຖືວ່າເປີດຮັບ (ຮອງຮັບຂໍ້ມູນເກົ່າ) */
const isOpen = p => p.open !== false;
const openPositions = d => (d.positions || []).filter(isOpen);

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
function isPositionOpenInBranch(branch, p){
  if(p.open === false) return false; // ຖ້າປິດຖາວອນຈາກພະແນກ ໃຫ້ປິດທຸກສາຂາ
  if(!branch) return true;
  if(branch.allPositions) return true;
  
  // ກວດສອບວ່າ posId ຂອງຕຳແໜ່ງນີ້ ມີຢູ່ໃນ openings ຂອງສາຂາທີ່ເລືອກຫຼືບໍ່
  return (branch.openings || []).some(op => op.posId === p.id);
}

// ຟັງຊັນໃໝ່: ສຳລັບດຶງຈຳນວນຄົນທີ່ຮັບໃນສາຂານັ້ນ
function getPositionHeadcount(branch, p){
  if(!branch || branch.allPositions) return 0;
  const opening = (branch.openings || []).find(op => op.posId === p.id);
  return opening ? opening.count : 0;
}

function branchOpenPositions(d, branch = currentBranch()){
  return (d.positions || []).filter(p => isPositionOpenInBranch(branch, p));
}

/* ==========================================================================
   SETTINGS — อีเมลแจ้งเตือน HR + โครงสร้างฟอร์มสมัคร
   ทั้งสองอย่างแก้ไขได้จากหน้า admin → แท็บ "ตั้งค่า" (เก็บใน Firestore
   collection "settings") — ถ้ายังไม่เคยตั้งค่า จะใช้ค่าตั้งต้นจากไฟล์แทน
   ========================================================================== */
let NOTIFY_EMAILS = HR_NOTIFY_EMAILS;
let FORM_FIELDS = DEFAULT_FORM_FIELDS;

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
    if(formSnap.exists() && Array.isArray(formSnap.data().fields)){
      FORM_FIELDS = formSnap.data().fields;
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
    navAll: "ຝ່າຍທັງໝົດ",
    heroEyebrow: "ຮ່ວມງານກັບ SSMI ສິນຊັບເມືອງເໜືອ",
    heroTitle: 'ເລືອກຕຳແໜ່ງທ່ານໂດດເດັ່ນ <span class="grad">ຄົ້ນຫາບົດບາດ</span> ທີ່ເປັນຂອງທ່ານ',
    heroSub: "ສຳຫຼວດແຕ່ລະຝ່າຍໃນສະຖາບັນການເງິນຈຸລະພາກຂອງພວກເຮົາ ເບິ່ງພາລະໜ້າທີ່ ແລະ ຕຳແໜ່ງທີ່ເປີດຮັບ ແລ້ວຍື່ນໃບສະໝັກໄດ້ທັນທີຈາກໜ້ານີ້",
    statDepts: "ຝ່າຍທັງໝົດ",
    statOpen: "ຕຳແໜ່ງທີ່ເປີດຮັບ",
    branchTitle: "ເລືອກສາຂາ",
    branchSub: n => `ທັງໝົດ ${n} ສາຂາ — ກົດເລືອກສາຂາເພື່ອເບິ່ງຕຳແໜ່ງທີ່ເປີດຮັບຢູ່ໃນສາຂານັ້ນ`,
    branchLabel: "ສາຂາ",
    dirTitle: "ຝ່າຍໃນອົງກອນ",
    dirSub: "ຄລິກທີ່ກາດເພື່ອເບິ່ງລາຍລະອຽດ ແລະ ຕຳແໜ່ງທີ່ເປີດຮັບ",
    nDuties: n => `${n} ພາລະບົດບາດຫຼັກ`,
    openN: n => `ເປີດຮັບ ${n} ຕຳແໜ່ງ`,
    openZero: "ຝາກປະຫວັດໄວ້",
    back: "← ກັບໄປໜ້າຝ່າຍທັງໝົດ",
    openPositions: "ຕຳແໜ່ງເປີດຮັບ",
    respTitle: "ໜ້າທີ່ຫຼັກຂອງຕຳແໜ່ງນີ້",
    respTitles: "ໜ້າທີ່ຫຼັກຂອງຝ່າຍນີ້",
    posTitle: "ຕຳແໜ່ງທີ່ເປີດຮັບ",
    posEmpty: "ປັດຈຸບັນຝ່າຍນີ້ຍັງບໍ່ມີຕຳແໜ່ງເປີດຮັບ ຫາກສົນໃຈຮ່ວມງານໃນອະນາຄົດ ສາມາດຝາກປະຫວັດໄວ້ລ່ວງໜ້າໄດ້",
    applyGeneral: "ຝາກປະຫວັດໄວ້ກັບຝ່າຍນີ້",
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
    footerNote: "ຂໍ້ມູນຜູ້ສະໝັກຈະຖືກສົ່ງກົງເຖິງຝ່າຍບຸກຄະລາກອນເພື່ອພິຈາລະນາ",
    loading: "ກຳລັງໂຫຼດຂໍ້ມູນຝ່າຍ...",
    errNotConfigured: "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Firebase — ເບິ່ງວິທີຕັ້ງຄ່າໃນ README.md",
    errCore: "ກະລຸນາກອກຊື່, ອີເມວ ແລະ ເບີໂທລະສັບໃຫ້ຄົບ",
    errNeedFile: label => `ກະລຸນາແນບໄຟລ໌: ${label}`,
    errFileSize: label => `ໄຟລ໌ "${label}" ຕ້ອງມີຂະໜາດບໍ່ເກີນ 5MB`,
    errNeedField: label => `ກະລຸນາກອກ: ${label}`,
    sending: "ກຳລັງສົ່ງໃບສະໝັກ...",
    sent: "ສົ່ງໃບສະໝັກຮຽບຮ້ອຍ ຂອບໃຈທີ່ສົນໃຈຮ່ວມງານກັບພວກເຮົາ",
    sendFailed: "ເກີດຂໍ້ຜິດພາດໃນການສົ່ງໃບສະໝັກ ກະລຸນາລອງໃໝ່ອີກຄັ້ງ"
  },
  en: {
    docTitle: "Careers at SSMI — Apply by department",
    brand: "SSMI — Sinsub Muang Nuea",
    navAll: "All departments",
    heroEyebrow: "Careers at SSMI Sinsub Muang Nuea",
    heroTitle: 'Choose the right team, <span class="grad">find the role</span> that fits you',
    heroSub: "Explore every department in our microfinance institution, review responsibilities and open positions, then apply directly from this page.",
    statDepts: "Departments",
    statOpen: "Open positions",
    branchTitle: "Choose a branch",
    branchSub: n => `${n} branches in total — pick one to see the positions open there`,
    branchLabel: "Branch",
    dirTitle: "Departments",
    dirSub: "Click a card to see details and open positions",
    nDuties: n => `${n} key duties`,
    openN: n => `${n} open position${n > 1 ? "s" : ""}`,
    openZero: "No openings yet",
    back: "← Back to all departments",
    openPositions: "Open positions",
    respTitle: "Department responsibilities",
    posTitle: "Open positions",
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
    sendFailed: "Something went wrong while submitting. Please try again."
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
function renderDirectory(){
  const branch = currentBranch();
  const totalOpen = totalOpenPositions(branch);

  // ดึงทุกแผนกที่มีตำแหน่งอย่างน้อย 1 ตำแหน่งมาแสดงเสมอ
  const activeDepts = DEPARTMENTS.filter(d => (d.positions || []).length > 0);

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
          <div class="flex-1 min-w-[140px] rounded-2xl border border-white/60 bg-white/70 px-5 py-4 shadow-xl shadow-indigo-500/10 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:flex-none sm:px-7 sm:py-5">
            <!-- อัปเดตตัวเลขแผนกให้แสดงเฉพาะที่มีตำแหน่งในสาขานี้ -->
            <b class="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text font-display text-2xl font-extrabold text-transparent sm:text-3xl">${activeDepts.length}</b>
            <span class="text-sm font-medium text-slate-500">${t("statDepts")}</span>
          </div>
          <div class="flex-1 min-w-[140px] rounded-2xl border border-white/60 bg-white/70 px-5 py-4 shadow-xl shadow-indigo-500/10 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:flex-none sm:px-7 sm:py-5">
            <b class="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text font-display text-2xl font-extrabold text-transparent sm:text-3xl">${totalOpen}</b>
            <span class="text-sm font-medium text-slate-500">${t("statOpen")}</span>
          </div>
        </div>
      </div>
    </section>

    ${branchTabsHtml()}

    <section class="relative pb-16 sm:pb-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="mb-8 sm:mb-10">
          <h2 class="font-display text-2xl font-bold text-slate-900 sm:text-3xl">${t("dirTitle")}</h2>
          <p class="mt-1 text-slate-500">${t("dirSub")}</p>
        </div>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          <!-- แสดงเฉพาะการ์ดแผนกที่มีตำแหน่ง ถ้าไม่มีเลยให้แสดงข้อความแจ้งเตือน -->
          ${activeDepts.length > 0 
            ? activeDepts.map(d => deptCard(d)).join("")
            : `<div class="col-span-full rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm font-semibold text-slate-400">ປັດຈຸບັນຍັງບໍ່ມີຕຳແໜ່ງເປີດຮັບໃນສາຂານີ້ <br>(ไม่มีตำแหน่งเปิดรับในสาขานี้)</div>`
          }
        </div>
      </div>
    </section>
  `;
  bindBranchTabs();
}

function deptCard(d){
  const openN = branchOpenPositions(d).length;
  return `
    <a class="group relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-md transition-all duration-300 ease-in-out hover:-translate-y-2 hover:scale-[1.02] hover:border-indigo-300 hover:shadow-2xl hover:shadow-indigo-500/20 sm:p-7" href="#/dept/${d.id}">
      <span class="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 transition-transform duration-300 group-hover:scale-x-100"></span>
      <span class="inline-flex w-fit items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-mono text-[0.68rem] font-bold tracking-widest text-indigo-600">${escapeHtml(d.code || "")}</span>
      <h3 class="font-display text-lg font-bold text-slate-900 transition-colors duration-300 group-hover:text-indigo-600">${escapeHtml(tr(d, "name"))}</h3>
      <p class="line-clamp-3 text-sm text-slate-500">${escapeHtml(tr(d, "mission"))}</p>
      <div class="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
        <span class="text-slate-400">${t("nDuties")(trList(d, "responsibilities").length)}</span>
        <span class="font-bold ${openN === 0 ? "text-slate-400" : "text-emerald-600"}">${openN > 0 ? t("openN")(openN) : t("openZero")}</span>
      </div>
    </a>
  `;
}

/* ---------------- Department detail view ---------------- */
function deptSidebarItem(d, active){
  const openN = branchOpenPositions(d).length;
  return `
    <a class="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1 rounded-xl px-3 py-2.5 transition-all duration-200 ${active ? "bg-gradient-to-r from-indigo-50 to-purple-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"}" href="#/dept/${d.id}">
      <span class="inline-flex w-fit items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[0.6rem] font-bold tracking-widest text-indigo-600">${escapeHtml(d.code || "")}</span>
      <span class="truncate text-sm font-semibold ${active ? "text-indigo-700" : "text-slate-700"}">${escapeHtml(tr(d, "name"))}</span>
      <span class="col-start-2 text-[0.72rem] font-semibold ${openN === 0 ? "text-slate-400" : "text-emerald-600"}">${openN > 0 ? t("openN")(openN) : t("openZero")}</span>
    </a>
  `;
}

function renderDetail(deptId){
  const d = DEPARTMENTS.find(x => x.id === deptId);
  if(!d){ renderDirectory(); return; }
  const branch = currentBranch();
  
  const allPositions = d.positions || [];
  // เปลี่ยนมาดึงทุกตำแหน่งมาแสดง (ไม่ต้อง filter ทิ้งแล้ว)
  const positions = allPositions.map((p, i) => ({ p, i }));
  const resp = trList(d, "responsibilities");
  
  // เมนูด้านซ้ายก็แสดงทุกแผนกที่มีตำแหน่งเช่นกัน
  const activeDeptsSidebar = DEPARTMENTS.filter(dept => (dept.positions || []).length > 0);

  app.innerHTML = `
    ${branchTabsHtml()}
    <section class="py-8 sm:py-14">
      <div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 sm:gap-8 sm:px-6 lg:grid-cols-[272px_1fr]">
        
        <!-- เมนูด้านซ้าย (Sidebar): ดึงรายการแผนกที่ผ่านการกรองมาแสดง -->
        <aside class="order-2 lg:order-1 lg:sticky lg:top-24 lg:self-start">
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <h2 class="mb-3 px-1 font-display text-xs font-bold uppercase tracking-widest text-slate-400">${t("dirTitle")}</h2>
            <nav class="flex max-h-56 flex-col gap-1 overflow-y-auto lg:max-h-none lg:overflow-visible">
              ${activeDeptsSidebar.map(dept => deptSidebarItem(dept, dept.id === deptId)).join("")}
            </nav>
          </div>
        </aside>

        <!-- เนื้อหาหลักด้านขวา -->
        <div class="order-1 min-w-0 lg:order-2">
          <a href="#/" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors duration-200 hover:text-indigo-600">${t("back")}</a>
          <div class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div>
              <span class="inline-flex w-fit items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-mono text-[0.68rem] font-bold tracking-widest text-indigo-600">${escapeHtml(d.code || "")}</span>
              <h1 class="mt-3 font-display text-2xl font-extrabold text-slate-900 sm:text-3xl lg:text-4xl">${escapeHtml(tr(d, "name"))}</h1>
              <p class="mt-3 max-w-2xl text-slate-600">${escapeHtml(tr(d, "mission"))}</p>
            </div>
            <div class="flex shrink-0 items-center gap-4 rounded-2xl border border-white/60 bg-gradient-to-br from-indigo-50 to-purple-50 px-6 py-4 text-center shadow-md sm:flex-col sm:gap-0">
              <b class="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text font-display text-3xl font-extrabold text-transparent">${positions.filter(({ p }) => isPositionOpenInBranch(branch, p)).length}</b>
              <span class="text-xs font-semibold text-slate-500">${t("openPositions")}</span>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            
            <!-- กล่องซ้าย (ในเนื้อหาหลัก): ภาระหน้าที่ของแผนก (ทำเป็นลิ้นชัก) -->
            <div class="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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

            <!-- กล่องขวา: ตำแหน่งที่เปิดรับ -->
            <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h4 class="mb-4 font-display text-base font-bold text-slate-900">${t("posTitle")}</h4>
              <div class="flex flex-col gap-4">
                ${positions.length
                  ? positions.map(({ p, i }) => positionCard(d, p, i)).join("")
                  : `<div class="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">${t("posEmpty")}</div>`
                }
              </div>
              <div class="mt-4">
                <!-- ปุ่ม Apply ที่คุณแก้ไว้สวยงามแล้ว -->
                <button class="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/40 sm:w-auto" data-apply-general="${d.id}">${t("applyGeneral")}</button>
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

function positionCard(d, p, i){
  const duties = trList(p, "duties");
  const branch = currentBranch();
  const opened = isPositionOpenInBranch(branch, p);
  const headcount = getPositionHeadcount(branch, p);

  return `
    <div class="group/card rounded-2xl border ${opened ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"} p-4 shadow-sm transition-all duration-300 sm:p-5 ${opened ? "hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/10" : ""}">
      <div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <h5 class="font-display text-base font-bold text-slate-900">${escapeHtml(tr(p, "title"))}</h5>
          <div class="mt-2 flex flex-wrap gap-2">
            <span class="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">${escapeHtml(tr(p, "type") || p.type || "")}</span>
            
            <!-- ສະແດງປ້າຍຈຳນວນຄົນ (ຖ້າເປີດຮັບ ແລະ ບໍ່ແມ່ນສຳນັກງານໃຫຍ່ທີ່ຮັບທັງໝົດ) -->
            ${opened && headcount > 0 ? `<span class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">ຮັບ ${headcount} ຕຳແໜ່ງ</span>` : ""}
            
            <!-- ປ້າຍຍັງບໍ່ເປີດຮັບ -->
            ${!opened ? `<span class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">${t("closedTag")}</span>` : ""}
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
  `;
}

/* ---------------- Application modal ---------------- */
const overlay = document.getElementById("apply-overlay");
const form = document.getElementById("apply-form");
const statusEl = document.getElementById("apply-status");
const submitBtn = document.getElementById("apply-submit");

/* statusEl.className gets reassigned wholesale on every status update (not just
   toggled), so its Tailwind classes have to be re-applied here rather than baked
   into the static HTML once. */
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

function customFieldHtml(f){
  const req = f.required ? '<em>*</em>' : "";
  const label = `<span class="${FIELD_LABEL_CLS}">${escapeHtml(f.label)} ${req}</span>`;
  const ph = escapeHtml(f.placeholder || "");
  switch(f.type){
    case "textarea":
      return `<label class="block">${label}<textarea data-field-id="${escapeHtml(f.id)}" rows="4" placeholder="${ph}" class="${FIELD_INPUT_CLS} resize-y"></textarea></label>`;
    case "select": {
      const opts = (f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      return `<label class="block">${label}<select data-field-id="${escapeHtml(f.id)}" class="${FIELD_INPUT_CLS}"><option value="">${t("selectPlaceholder")}</option>${opts}</select></label>`;
    }
    case "file":
      return `<label class="block">${label}<input type="file" data-field-id="${escapeHtml(f.id)}" accept="application/pdf" class="${FIELD_FILE_CLS}"></label>`;
    case "image":
      return `<label class="block">${label}<input type="file" data-field-id="${escapeHtml(f.id)}" accept="image/*" class="${FIELD_FILE_CLS}"></label>`;
    default: { // text, url, number, date
      const type = ["url","number","date"].includes(f.type) ? f.type : "text";
      return `<label class="block">${label}<input type="${type}" data-field-id="${escapeHtml(f.id)}" placeholder="${ph}" class="${FIELD_INPUT_CLS}"></label>`;
    }
  }
}

function renderCustomFields(){
  document.getElementById("custom-fields").innerHTML =
    (FORM_FIELDS || []).map(customFieldHtml).join("");
}

let applyingToOpenPosition = true;

function openApplyModal(dept, position){
  applyingToOpenPosition = isOpen(position);
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
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  const firstInput = document.getElementById("field-name");
  if(firstInput) firstInput.focus();
}

function closeApplyModal(){
  overlay.hidden = true;
  document.body.style.overflow = "";
}

document.getElementById("apply-close").addEventListener("click", closeApplyModal);
overlay.addEventListener("click", e => { if(e.target === overlay) closeApplyModal(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && !overlay.hidden) closeApplyModal(); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if(FIREBASE_NOT_CONFIGURED){
    setApplyStatus(t("errNotConfigured"), "err");
    return;
  }

  const nameVal = document.getElementById("field-name").value.trim();
  const emailVal = document.getElementById("field-email").value.trim();
  const phoneVal = document.getElementById("field-phone").value.trim();
  const departmentVal = document.getElementById("field-department").value;
  const departmentIdVal = document.getElementById("field-department-id").value;
  const positionVal = document.getElementById("field-position").value;
  const branchVal = document.getElementById("field-branch").value;
  const branchIdVal = document.getElementById("field-branch-id").value;

  if(!nameVal || !emailVal || !phoneVal){
    setApplyStatus(t("errCore"), "err");
    return;
  }

  /* เก็บค่าจากช่องกรอกที่ admin ตั้งค่าไว้ */
  const answers = {};          // { label: value } สำหรับช่องข้อความ
  const fileUploads = [];      // { field, file } สำหรับช่องแนบไฟล์/รูป
  for(const f of (FORM_FIELDS || [])){
    const el = form.querySelector(`[data-field-id="${CSS.escape(f.id)}"]`);
    if(!el) continue;
    if(f.type === "file" || f.type === "image"){
      const file = el.files[0] || null;
      if(f.required && !file){
        setApplyStatus(t("errNeedFile")(f.label), "err");
        return;
      }
      if(file){
        if(file.size > 5 * 1024 * 1024){
          setApplyStatus(t("errFileSize")(f.label), "err");
          return;
        }
        fileUploads.push({ field: f, file });
      }
    } else {
      const val = el.value.trim();
      if(f.required && !val){
        setApplyStatus(t("errNeedField")(f.label), "err");
        el.focus();
        return;
      }
      answers[f.label] = val;
    }
  }

  submitBtn.disabled = true;
  setApplyStatus(t("sending"));

  try {
    // สร้าง document ID ล่วงหน้า เพื่อใช้เป็นโฟลเดอร์เก็บไฟล์แนบ
    const appRef = doc(collection(db, APPLICATIONS_COLLECTION));

    // อัปโหลดไฟล์แนบทั้งหมด (PDF ไปโฟลเดอร์ resumes เพื่อเข้ากับ rules เดิม,
    // รูปภาพไปโฟลเดอร์ attachments)
    const attachments = [];
    for(const { field, file } of fileUploads){
      const folder = field.type === "image" ? ATTACHMENTS_STORAGE_FOLDER : RESUME_STORAGE_FOLDER;
      const path = `${folder}/${appRef.id}/${field.id}-${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type || "application/pdf" });
      const url = await getDownloadURL(fileRef);
      attachments.push({ label: field.label, name: file.name, url, path });
    }

    // ข้อความอีเมลแจ้งเตือน HR
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
      // ฟิลด์ด้านล่างถูกอ่านโดย Extension "Trigger Email from Firestore"
      // เพื่อส่งอีเมลแจ้ง HR อัตโนมัติ — ชื่อฟิลด์ `to` และ `message`
      // เป็นชื่อที่ extension กำหนดตายตัว ห้ามเปลี่ยน
      // (รายชื่ออีเมล NOTIFY_EMAILS แก้ได้จากหน้า admin → แท็บ "ตั้งค่า")
      to: NOTIFY_EMAILS,
      message: { subject, text: emailText }
    });

    setApplyStatus(t("sent"), "ok");
    form.reset();
    setTimeout(closeApplyModal, 1800);
  } catch (err){
    console.error(err);
    setApplyStatus(t("sendFailed"), "err");
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------- Router ---------------- */
function route({ keepScroll = false } = {}){
  const scrollY = window.scrollY;
  const hash = location.hash.replace(/^#\/?/, "");
  if(hash.startsWith("dept/")){
    renderDetail(hash.replace("dept/", ""));
  } else {
    renderDirectory();
  }
  window.scrollTo(0, keepScroll ? scrollY : 0);
}

window.addEventListener("hashchange", route);

applyStaticI18n();
app.innerHTML = `<section class="px-6 py-24 text-center text-slate-400"><div class="mx-auto max-w-6xl">${t("loading")}</div></section>`;
Promise.all([loadDepartments(), loadBranches(), loadSettings()]).then(route);