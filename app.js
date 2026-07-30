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
  DEPARTMENTS_COLLECTION, SETTINGS_COLLECTION,
  RESUME_STORAGE_FOLDER, ATTACHMENTS_STORAGE_FOLDER
} from "./firebase-config.js";
import { DEFAULT_DEPARTMENTS } from "./departments-data.js";
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
    dirTitle: "ຝ່າຍໃນອົງກອນ",
    dirSub: "ຄລິກທີ່ກາດເພື່ອເບິ່ງລາຍລະອຽດ ແລະ ຕຳແໜ່ງທີ່ເປີດຮັບ",
    nDuties: n => `${n} ພາລະກິດຫຼັກ`,
    openN: n => `ເປີດຮັບ ${n} ຕຳແໜ່ງ`,
    openZero: "ຍັງບໍ່ເປີດຮັບ",
    back: "← ກັບໄປໜ້າຝ່າຍທັງໝົດ",
    openPositions: "ຕຳແໜ່ງເປີດຮັບ",
    respTitle: "ພາລະໜ້າທີ່ຫຼັກຂອງຝ່າຍ",
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

function totalOpenPositions(){
  return DEPARTMENTS.reduce((sum, d) => sum + openPositions(d).length, 0);
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}

/* ---------------- Directory view ---------------- */
function renderDirectory(){
  const totalOpen = totalOpenPositions();

  app.innerHTML = `
    <section class="hero">
      <div class="wrap">
        <p class="hero-eyebrow">${t("heroEyebrow")}</p>
        <h1>${t("heroTitle")}</h1>
        <p>${t("heroSub")}</p>
        <div class="hero-stats">
          <div class="hero-stat"><b>${DEPARTMENTS.length}</b><span>${t("statDepts")}</span></div>
          <div class="hero-stat"><b>${totalOpen}</b><span>${t("statOpen")}</span></div>
        </div>
      </div>
    </section>

    <section class="directory">
      <div class="wrap">
        <div class="directory-head">
          <h2>${t("dirTitle")}</h2>
          <p>${t("dirSub")}</p>
        </div>
        <div class="dept-grid">
          ${DEPARTMENTS.map(deptCard).join("")}
        </div>
      </div>
    </section>
  `;
}

function deptCard(d){
  const openN = openPositions(d).length;
  return `
    <a class="dept-card" href="#/dept/${d.id}">
      <span class="dept-code">${escapeHtml(d.code || "")}</span>
      <h3>${escapeHtml(tr(d, "name"))}</h3>
      <p>${escapeHtml(tr(d, "mission"))}</p>
      <div class="dept-meta">
        <span>${t("nDuties")(trList(d, "responsibilities").length)}</span>
        <span class="open-count ${openN === 0 ? "is-zero" : ""}">${openN > 0 ? t("openN")(openN) : t("openZero")}</span>
      </div>
    </a>
  `;
}

/* ---------------- Department detail view ---------------- */
function renderDetail(deptId){
  const d = DEPARTMENTS.find(x => x.id === deptId);
  if(!d){ renderDirectory(); return; }
  const positions = d.positions || [];
  const resp = trList(d, "responsibilities");

  app.innerHTML = `
    <section class="detail">
      <div class="wrap">
        <a href="#/" class="back-link">${t("back")}</a>

        <div class="detail-head">
          <div>
            <span class="dept-code">${escapeHtml(d.code || "")}</span>
            <h1>${escapeHtml(tr(d, "name"))}</h1>
            <p class="mission">${escapeHtml(tr(d, "mission"))}</p>
          </div>
          <div class="detail-figure">
            <b>${positions.filter(isOpen).length}</b>
            ${t("openPositions")}
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-block">
            <h4>${t("respTitle")}</h4>
            <ul class="resp-list">
              ${resp.map(r => `<li>${escapeHtml(r)}</li>`).join("")}
            </ul>
          </div>

          <div class="detail-block">
            <h4>${t("posTitle")}</h4>
            <div class="position-list">
              ${positions.length
                ? positions.map((p, i) => positionCard(d, p, i)).join("")
                : `<div class="position-empty">${t("posEmpty")}</div>`
              }
            </div>
            <div style="margin-top:16px">
              <button class="btn btn--ghost" data-apply-general="${d.id}">${t("applyGeneral")}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

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
  const opened = isOpen(p);
  return `
    <div class="position-card ${opened ? "" : "position-card--closed"}">
      <div class="position-top">
        <div>
          <h5>${escapeHtml(tr(p, "title"))}</h5>
          <div class="position-tags">
            <span class="tag">${escapeHtml(tr(p, "type") || p.type || "")}</span>
            ${opened ? "" : `<span class="tag tag--closed">${t("closedTag")}</span>`}
          </div>
        </div>
        <button class="btn ${opened ? "btn--primary" : "btn--ghost"}" data-apply="${i}">
          ${opened ? t("applyBtn") : t("applyClosedBtn")}
        </button>
      </div>
      <p class="position-body">${escapeHtml(tr(p, "description"))}</p>
      ${duties.length ? `
        <details class="duties-details">
          <summary>${t("dutiesN")(duties.length)}</summary>
          <ul class="resp-list duties-list">
            ${duties.map(du => `<li>${escapeHtml(du)}</li>`).join("")}
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

/* render ช่องกรอกเพิ่มเติมตามที่ admin ตั้งค่าไว้ (settings/applicationForm) */
function customFieldHtml(f){
  const req = f.required ? '<em>*</em>' : "";
  const label = `<span>${escapeHtml(f.label)} ${req}</span>`;
  const ph = escapeHtml(f.placeholder || "");
  switch(f.type){
    case "textarea":
      return `<label class="field">${label}<textarea data-field-id="${escapeHtml(f.id)}" rows="4" placeholder="${ph}"></textarea></label>`;
    case "select": {
      const opts = (f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      return `<label class="field">${label}<select data-field-id="${escapeHtml(f.id)}"><option value="">${t("selectPlaceholder")}</option>${opts}</select></label>`;
    }
    case "file":
      return `<label class="field field--file">${label}<input type="file" data-field-id="${escapeHtml(f.id)}" accept="application/pdf"></label>`;
    case "image":
      return `<label class="field field--file">${label}<input type="file" data-field-id="${escapeHtml(f.id)}" accept="image/*"></label>`;
    default: { // text, url, number, date
      const type = ["url","number","date"].includes(f.type) ? f.type : "text";
      return `<label class="field">${label}<input type="${type}" data-field-id="${escapeHtml(f.id)}" placeholder="${ph}"></label>`;
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
  document.getElementById("apply-dept-label").textContent = tr(dept, "name");
  document.getElementById("apply-title").textContent = t("applyFor")(tr(position, "title") || position.title);
  form.reset();
  renderCustomFields();
  document.getElementById("field-department").value = dept.name;
  document.getElementById("field-department-id").value = dept.id || "";
  document.getElementById("field-position").value = position.title;
  statusEl.textContent = "";
  statusEl.className = "form-status";
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
    statusEl.textContent = t("errNotConfigured");
    statusEl.className = "form-status err";
    return;
  }

  const nameVal = document.getElementById("field-name").value.trim();
  const emailVal = document.getElementById("field-email").value.trim();
  const phoneVal = document.getElementById("field-phone").value.trim();
  const departmentVal = document.getElementById("field-department").value;
  const departmentIdVal = document.getElementById("field-department-id").value;
  const positionVal = document.getElementById("field-position").value;

  if(!nameVal || !emailVal || !phoneVal){
    statusEl.textContent = t("errCore");
    statusEl.className = "form-status err";
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
        statusEl.textContent = t("errNeedFile")(f.label);
        statusEl.className = "form-status err";
        return;
      }
      if(file){
        if(file.size > 5 * 1024 * 1024){
          statusEl.textContent = t("errFileSize")(f.label);
          statusEl.className = "form-status err";
          return;
        }
        fileUploads.push({ field: f, file });
      }
    } else {
      const val = el.value.trim();
      if(f.required && !val){
        statusEl.textContent = t("errNeedField")(f.label);
        statusEl.className = "form-status err";
        el.focus();
        return;
      }
      answers[f.label] = val;
    }
  }

  submitBtn.disabled = true;
  statusEl.textContent = t("sending");
  statusEl.className = "form-status";

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
      `${positionVal} (${departmentVal})`;
    const emailText =
      `มีผู้สมัครใหม่\n\n` +
      `ตำแหน่ง: ${positionVal}\n` +
      `แผนก: ${departmentVal}\n` +
      `ชื่อ-นามสกุล: ${nameVal}\n` +
      `อีเมล: ${emailVal}\n` +
      `เบอร์โทรศัพท์: ${phoneVal}\n\n` +
      `ข้อมูลเพิ่มเติม:\n${answerLines || "-"}\n\n` +
      `ไฟล์แนบ:\n${attachmentLines}`;

    await setDoc(appRef, {
      department: departmentVal,
      departmentId: departmentIdVal,
      position: positionVal,
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

    statusEl.textContent = t("sent");
    statusEl.className = "form-status ok";
    form.reset();
    setTimeout(closeApplyModal, 1800);
  } catch (err){
    console.error(err);
    statusEl.textContent = t("sendFailed");
    statusEl.className = "form-status err";
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------- Router ---------------- */
function route(){
  const hash = location.hash.replace(/^#\/?/, "");
  if(hash.startsWith("dept/")){
    renderDetail(hash.replace("dept/", ""));
  } else {
    renderDirectory();
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);

applyStaticI18n();
app.innerHTML = `<section class="directory"><div class="wrap" style="padding:64px 28px; color: var(--text-3);">${t("loading")}</div></section>`;
Promise.all([loadDepartments(), loadSettings()]).then(route);