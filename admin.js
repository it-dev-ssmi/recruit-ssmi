/* ==========================================================================
   ADMIN PAGE — จัดการข้อมูลแผนก/ตำแหน่ง และดูใบสมัคร
   ใช้ Firebase project เดียวกับหน้าเว็บสาธารณะ (firebase-config.js)
   ต้องล็อกอินด้วย Firebase Authentication (Email/Password) ก่อนใช้งาน
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getStorage, ref, deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import {
  firebaseConfig, HR_NOTIFY_EMAILS, APPLICATIONS_COLLECTION,
  DEPARTMENTS_COLLECTION, SETTINGS_COLLECTION
} from "./firebase-config.js";
import { DEFAULT_DEPARTMENTS } from "./departments-data.js";
import { DEFAULT_FORM_FIELDS, FIELD_TYPES } from "./form-defaults.js";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const storage = getStorage(firebaseApp);
const FIREBASE_NOT_CONFIGURED = firebaseConfig.apiKey === "YOUR_API_KEY";

document.getElementById("year").textContent = new Date().getFullYear();

const $ = id => document.getElementById(id);
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}
function setStatus(el, msg, kind = ""){
  el.textContent = msg;
  el.className = "form-status" + (kind ? " " + kind : "");
}

/* ==========================================================================
   AUTH — ล็อกอิน / ล็อกเอาต์ / สลับหน้าจอ
   ========================================================================== */
const loginView = $("login-view");
const adminView = $("admin-view");
const logoutBtn = $("logout-btn");

if(FIREBASE_NOT_CONFIGURED){
  loginView.hidden = false;
  setStatus($("login-status"), "ยังไม่ได้ตั้งค่า Firebase — แก้ไข firebase-config.js ก่อน (ดู README.md)", "err");
}

onAuthStateChanged(auth, user => {
  if(FIREBASE_NOT_CONFIGURED) return;
  if(user){
    loginView.hidden = true;
    adminView.hidden = false;
    logoutBtn.hidden = false;
    $("admin-email").textContent = user.email || "(ไม่ทราบอีเมล)";
    loadDepartments();
    loadApplications();
    loadSettings();
  } else {
    loginView.hidden = false;
    adminView.hidden = true;
    logoutBtn.hidden = true;
  }
});

$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  if(FIREBASE_NOT_CONFIGURED) return;
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if(!email || !password){
    setStatus($("login-status"), "กรุณากรอกอีเมลและรหัสผ่าน", "err");
    return;
  }
  $("login-submit").disabled = true;
  setStatus($("login-status"), "กำลังเข้าสู่ระบบ...");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    setStatus($("login-status"), "");
  } catch (err){
    console.error(err);
    const msg = {
      "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      "auth/user-not-found": "ไม่พบบัญชีนี้ในระบบ",
      "auth/wrong-password": "รหัสผ่านไม่ถูกต้อง",
      "auth/too-many-requests": "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
      "auth/operation-not-allowed": "ยังไม่ได้เปิดใช้งาน Email/Password ใน Firebase Console → Authentication"
    }[err.code] || "เข้าสู่ระบบไม่สำเร็จ: " + err.code;
    setStatus($("login-status"), msg, "err");
  } finally {
    $("login-submit").disabled = false;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

/* ==========================================================================
   TABS
   ========================================================================== */
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("is-active", b === btn));
    $("tab-departments").hidden = btn.dataset.tab !== "departments";
    $("tab-applications").hidden = btn.dataset.tab !== "applications";
    $("tab-settings").hidden = btn.dataset.tab !== "settings";
  });
});

/* ==========================================================================
   DEPARTMENTS — โหลด / เพิ่ม / แก้ไข / ลบ / จัดลำดับ
   ========================================================================== */
let departments = [];

async function loadDepartments(){
  const listEl = $("dept-admin-list");
  listEl.innerHTML = `<p class="admin-loading">กำลังโหลดข้อมูลแผนก...</p>`;
  try {
    const snap = await getDocs(query(collection(db, DEPARTMENTS_COLLECTION), orderBy("order")));
    departments = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    renderDepartmentList();
  } catch (err){
    console.error(err);
    listEl.innerHTML = `<p class="admin-error">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</p>`;
  }
}

function renderDepartmentList(){
  const listEl = $("dept-admin-list");
  if(!departments.length){
    listEl.innerHTML = `
      <div class="admin-empty">
        <p>ยังไม่มีข้อมูลแผนกใน Firestore</p>
        <p class="admin-empty-sub">กด <b>"นำเข้าข้อมูลตั้งต้น"</b> เพื่อนำแผนกทั้ง ${DEFAULT_DEPARTMENTS.length} แผนกจากไฟล์เดิมขึ้นระบบ แล้วค่อยแก้ไขต่อ หรือกด "+ เพิ่มแผนกใหม่" เพื่อเริ่มจากศูนย์</p>
      </div>`;
    return;
  }
  listEl.innerHTML = departments.map((d, idx) => `
    <div class="dept-admin-card" data-docid="${escapeHtml(d.docId)}">
      <div class="dept-admin-main">
        <span class="dept-code">${escapeHtml(d.code || "—")}</span>
        <div class="dept-admin-info">
          <h3>${escapeHtml(d.name || "(ไม่มีชื่อ)")}</h3>
          <p>${escapeHtml(d.mission || "")}</p>
          <div class="dept-admin-meta">
            <span>ลำดับ: ${d.order ?? "-"}</span>
            <span>${(d.responsibilities || []).length} ภารกิจ</span>
            <span>${(d.positions || []).length} ตำแหน่งเปิดรับ</span>
          </div>
        </div>
      </div>
      <div class="dept-admin-actions">
        <button class="btn btn--ghost btn--sm" data-move="up" ${idx === 0 ? "disabled" : ""} title="เลื่อนขึ้น">↑</button>
        <button class="btn btn--ghost btn--sm" data-move="down" ${idx === departments.length - 1 ? "disabled" : ""} title="เลื่อนลง">↓</button>
        <button class="btn btn--ghost btn--sm" data-action="edit">แก้ไข</button>
        <button class="btn btn--danger btn--sm" data-action="delete">ลบ</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".dept-admin-card").forEach(card => {
    const docId = card.dataset.docid;
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openDeptModal(docId));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteDepartment(docId));
    card.querySelector('[data-move="up"]').addEventListener("click", () => moveDepartment(docId, -1));
    card.querySelector('[data-move="down"]').addEventListener("click", () => moveDepartment(docId, +1));
  });
}

async function moveDepartment(docId, dir){
  const idx = departments.findIndex(d => d.docId === docId);
  const swapIdx = idx + dir;
  if(idx < 0 || swapIdx < 0 || swapIdx >= departments.length) return;
  const a = departments[idx], b = departments[swapIdx];
  const orderA = a.order ?? idx + 1, orderB = b.order ?? swapIdx + 1;
  try {
    await Promise.all([
      updateDoc(doc(db, DEPARTMENTS_COLLECTION, a.docId), { order: orderB }),
      updateDoc(doc(db, DEPARTMENTS_COLLECTION, b.docId), { order: orderA })
    ]);
    await loadDepartments();
  } catch (err){
    console.error(err);
    setStatus($("dept-status"), "สลับลำดับไม่สำเร็จ: " + err.message, "err");
  }
}

async function deleteDepartment(docId){
  const d = departments.find(x => x.docId === docId);
  if(!d) return;
  const ok = confirm(`ยืนยันลบแผนก "${d.name}" ?\n\nตำแหน่งทั้งหมด ${(d.positions || []).length} ตำแหน่งในแผนกนี้จะถูกลบไปด้วย และหน้าเว็บสาธารณะจะไม่แสดงแผนกนี้อีก\n(ใบสมัครเก่าที่เคยส่งเข้ามาจะไม่ถูกลบ)`);
  if(!ok) return;
  try {
    await deleteDoc(doc(db, DEPARTMENTS_COLLECTION, docId));
    setStatus($("dept-status"), `ลบแผนก "${d.name}" เรียบร้อย`, "ok");
    await loadDepartments();
  } catch (err){
    console.error(err);
    setStatus($("dept-status"), "ลบไม่สำเร็จ: " + err.message, "err");
  }
}

/* ---------- นำเข้าข้อมูลตั้งต้น ---------- */
$("seed-btn").addEventListener("click", async () => {
  if(departments.length){
    const ok = confirm(`ตอนนี้มีข้อมูลอยู่แล้ว ${departments.length} แผนก\nการนำเข้าจะ "เขียนทับ" แผนกที่มี id ตรงกับข้อมูลตั้งต้น (mkt, svc, adm, hr, it, acc, aud)\n\nต้องการดำเนินการต่อหรือไม่?`);
    if(!ok) return;
  }
  const btn = $("seed-btn");
  btn.disabled = true;
  setStatus($("dept-status"), "กำลังนำเข้าข้อมูลตั้งต้น...");
  try {
    for(let i = 0; i < DEFAULT_DEPARTMENTS.length; i++){
      const d = DEFAULT_DEPARTMENTS[i];
      const { id, ...data } = d;
      await setDoc(doc(db, DEPARTMENTS_COLLECTION, id), { ...data, order: i + 1 });
    }
    setStatus($("dept-status"), `นำเข้าข้อมูล ${DEFAULT_DEPARTMENTS.length} แผนกเรียบร้อย`, "ok");
    await loadDepartments();
  } catch (err){
    console.error(err);
    setStatus($("dept-status"), "นำเข้าไม่สำเร็จ: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

/* ==========================================================================
   DEPARTMENT MODAL — ฟอร์มเพิ่ม/แก้ไขแผนก + ตัวแก้ไขตำแหน่ง
   ========================================================================== */
const deptOverlay = $("dept-overlay");
const positionsContainer = $("positions-container");

function positionBlockHtml(p = {}){
  const duties = (p.duties || []).join("\n");
  return `
    <div class="position-edit-block">
      <div class="position-edit-head">
        <span class="position-edit-label">ตำแหน่ง</span>
        <button type="button" class="btn btn--danger btn--sm" data-remove-position>ลบตำแหน่งนี้</button>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>ชื่อตำแหน่ง <em>*</em></span>
          <input type="text" class="pos-title" value="${escapeHtml(p.title || "")}" placeholder="ພະນັກງານ...">
        </label>
        <label class="field">
          <span>ประเภท</span>
          <input type="text" class="pos-type" value="${escapeHtml(p.type || "ເຕັມເວລາ")}" placeholder="ເຕັມເວລາ / ສັນຍາຈ້າງ">
        </label>
      </div>
      <label class="field">
        <span>คำอธิบายตำแหน่ง</span>
        <textarea class="pos-description" rows="2">${escapeHtml(p.description || "")}</textarea>
      </label>
      <label class="field">
        <span>ภาระหน้าที่โดยละเอียด (1 บรรทัด = 1 ข้อ)</span>
        <textarea class="pos-duties" rows="5">${escapeHtml(duties)}</textarea>
      </label>
    </div>
  `;
}

function addPositionBlock(p){
  positionsContainer.insertAdjacentHTML("beforeend", positionBlockHtml(p));
  const block = positionsContainer.lastElementChild;
  block.querySelector("[data-remove-position]").addEventListener("click", () => {
    if(confirm("ลบตำแหน่งนี้ออกจากฟอร์ม? (จะมีผลเมื่อกดบันทึกแผนก)")) block.remove();
  });
}

$("add-position-btn").addEventListener("click", () => addPositionBlock({}));

function openDeptModal(docId = null){
  const d = docId ? departments.find(x => x.docId === docId) : null;
  $("dept-modal-title").textContent = d ? `แก้ไขแผนก: ${d.name}` : "เพิ่มแผนกใหม่";
  $("dept-doc-id").value = d ? d.docId : "";
  $("dept-code").value = d?.code || "";
  $("dept-name").value = d?.name || "";
  $("dept-mission").value = d?.mission || "";
  $("dept-order").value = d?.order ?? (departments.length + 1);
  $("dept-responsibilities").value = (d?.responsibilities || []).join("\n");
  positionsContainer.innerHTML = "";
  (d?.positions || []).forEach(p => addPositionBlock(p));
  setStatus($("dept-form-status"), "");
  deptOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  $("dept-code").focus();
}

function closeDeptModal(){
  deptOverlay.hidden = true;
  document.body.style.overflow = "";
}

$("add-dept-btn").addEventListener("click", () => openDeptModal(null));
$("dept-close").addEventListener("click", closeDeptModal);
deptOverlay.addEventListener("click", e => { if(e.target === deptOverlay) closeDeptModal(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && !deptOverlay.hidden) closeDeptModal(); });

function linesToArray(text){
  return text.split("\n").map(s => s.trim()).filter(Boolean);
}

$("dept-form").addEventListener("submit", async e => {
  e.preventDefault();
  const docId = $("dept-doc-id").value;
  const code = $("dept-code").value.trim();
  const name = $("dept-name").value.trim();
  if(!code || !name){
    setStatus($("dept-form-status"), "กรุณากรอกรหัสแผนกและชื่อแผนก", "err");
    return;
  }

  const positions = [...positionsContainer.querySelectorAll(".position-edit-block")].map(block => ({
    title: block.querySelector(".pos-title").value.trim(),
    type: block.querySelector(".pos-type").value.trim() || "ເຕັມເວລາ",
    description: block.querySelector(".pos-description").value.trim(),
    duties: linesToArray(block.querySelector(".pos-duties").value)
  })).filter(p => p.title);

  const data = {
    code: code.toUpperCase(),
    name,
    mission: $("dept-mission").value.trim(),
    order: Number($("dept-order").value) || departments.length + 1,
    responsibilities: linesToArray($("dept-responsibilities").value),
    positions
  };

  $("dept-save").disabled = true;
  setStatus($("dept-form-status"), "กำลังบันทึก...");
  try {
    if(docId){
      await setDoc(doc(db, DEPARTMENTS_COLLECTION, docId), data);
    } else {
      await addDoc(collection(db, DEPARTMENTS_COLLECTION), data);
    }
    setStatus($("dept-form-status"), "บันทึกเรียบร้อย", "ok");
    await loadDepartments();
    setTimeout(closeDeptModal, 700);
  } catch (err){
    console.error(err);
    setStatus($("dept-form-status"), "บันทึกไม่สำเร็จ: " + err.message, "err");
  } finally {
    $("dept-save").disabled = false;
  }
});

/* ==========================================================================
   APPLICATIONS — ดูใบสมัคร / เปลี่ยนสถานะ / ลบ
   ========================================================================== */
const STATUS_OPTIONS = [
  { value: "new",         label: "ใหม่" },
  { value: "reviewing",   label: "กำลังพิจารณา" },
  { value: "interviewed", label: "สัมภาษณ์แล้ว" },
  { value: "accepted",    label: "รับเข้าทำงาน" },
  { value: "rejected",    label: "ไม่ผ่าน" }
];
let applications = [];

async function loadApplications(){
  const listEl = $("apps-list");
  listEl.innerHTML = `<p class="admin-loading">กำลังโหลดใบสมัคร...</p>`;
  try {
    const snap = await getDocs(query(collection(db, APPLICATIONS_COLLECTION), orderBy("submittedAt", "desc")));
    applications = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    $("app-count").textContent = applications.length ? `(${applications.length})` : "";
    renderApplications();
  } catch (err){
    console.error(err);
    listEl.innerHTML = `<p class="admin-error">โหลดใบสมัครไม่สำเร็จ: ${escapeHtml(err.message)}</p>`;
  }
}

function formatDate(ts){
  if(!ts?.toDate) return "-";
  return ts.toDate().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}


/* คำตอบจากช่องกรอกที่ admin สร้างเอง (schema ใหม่: a.answers = {label: value}) */
function renderAnswers(a){
  const entries = Object.entries(a.answers || {}).filter(([, v]) => v);
  if(!entries.length) return "";
  return `<details class="app-message"><summary>ข้อมูลเพิ่มเติม (${entries.length} รายการ)</summary>
    <dl class="app-answers">${entries.map(([k, v]) =>
      `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>
  </details>`;
}

/* ไฟล์แนบ — รองรับทั้ง schema ใหม่ (a.attachments) และเก่า (a.resumeUrl/portfolioUrl) */
function renderAttachmentLinks(a){
  const links = [];
  (a.attachments || []).forEach(att => {
    links.push(`<a href="${escapeHtml(att.url)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">${escapeHtml(att.label)} ↗</a>`);
  });
  if(a.resumeUrl && !(a.attachments || []).length){
    links.push(`<a href="${escapeHtml(a.resumeUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">เปิดเรซูเม่ (PDF) ↗</a>`);
  }
  if(a.portfolioUrl){
    links.push(`<a href="${escapeHtml(a.portfolioUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">พอร์ตโฟลิโอ ↗</a>`);
  }
  return links.length ? links.join("") : `<span class="app-nolink">ไม่มีไฟล์แนบ</span>`;
}

function renderApplications(){
  const listEl = $("apps-list");
  if(!applications.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ยังไม่มีใบสมัครเข้ามา</p></div>`;
    return;
  }
  listEl.innerHTML = applications.map(a => `
    <div class="app-card" data-docid="${escapeHtml(a.docId)}">
      <div class="app-card-main">
        <div class="app-card-top">
          <h3>${escapeHtml(a.name)}</h3>
          <span class="app-status app-status--${escapeHtml(a.status || "new")}">${escapeHtml(STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status || "ใหม่")}</span>
        </div>
        <p class="app-position">${escapeHtml(a.position)} — ${escapeHtml(a.department)}</p>
        <div class="app-meta">
          <span>📧 ${escapeHtml(a.email)}</span>
          <span>📞 ${escapeHtml(a.phone)}</span>
          <span>🕐 ${formatDate(a.submittedAt)}</span>
          ${a.experience ? `<span>ประสบการณ์: ${escapeHtml(a.experience)}</span>` : ""}
        </div>
        ${renderAnswers(a)}
        ${a.coverMessage ? `<details class="app-message"><summary>ข้อความจากผู้สมัคร</summary><p>${escapeHtml(a.coverMessage)}</p></details>` : ""}
        <div class="app-links">
          ${renderAttachmentLinks(a)}
        </div>
      </div>
      <div class="app-card-actions">
        <select class="app-status-select">
          ${STATUS_OPTIONS.map(s => `<option value="${s.value}" ${s.value === (a.status || "new") ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
        <button class="btn btn--danger btn--sm" data-action="delete-app">ลบใบสมัคร</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".app-card").forEach(card => {
    const docId = card.dataset.docid;
    card.querySelector(".app-status-select").addEventListener("change", async e => {
      try {
        await updateDoc(doc(db, APPLICATIONS_COLLECTION, docId), { status: e.target.value });
        setStatus($("apps-status"), "อัปเดตสถานะเรียบร้อย", "ok");
        const a = applications.find(x => x.docId === docId);
        if(a) a.status = e.target.value;
        renderApplications();
      } catch (err){
        console.error(err);
        setStatus($("apps-status"), "อัปเดตไม่สำเร็จ: " + err.message, "err");
      }
    });
    card.querySelector('[data-action="delete-app"]').addEventListener("click", async () => {
      const a = applications.find(x => x.docId === docId);
      if(!confirm(`ยืนยันลบใบสมัครของ "${a?.name}" ?\nไฟล์เรซูเม่ที่แนบมา (ถ้ามี) จะถูกลบไปด้วย และกู้คืนไม่ได้`)) return;
      try {
        const paths = [
          ...(a?.attachments || []).map(att => att.path),
          a?.resumePath
        ].filter(Boolean);
        for(const p of paths){
          try { await deleteObject(ref(storage, p)); }
          catch (e){ console.warn("ลบไฟล์แนบไม่ได้ (อาจถูกลบไปแล้ว):", p, e); }
        }
        await deleteDoc(doc(db, APPLICATIONS_COLLECTION, docId));
        setStatus($("apps-status"), "ลบใบสมัครเรียบร้อย", "ok");
        await loadApplications();
      } catch (err){
        console.error(err);
        setStatus($("apps-status"), "ลบไม่สำเร็จ: " + err.message, "err");
      }
    });
  });
}

$("reload-apps-btn").addEventListener("click", loadApplications);

/* ==========================================================================
   SETTINGS — อีเมลแจ้งเตือน HR + ตัวสร้างฟอร์มสมัครงาน
   เก็บใน Firestore: settings/notifications และ settings/applicationForm
   หน้าเว็บสาธารณะโหลดค่าพวกนี้ไป render ฟอร์ม/ส่งอีเมลโดยอัตโนมัติ
   ========================================================================== */
let formFields = [];

async function loadSettings(){
  try {
    const [notifSnap, formSnap] = await Promise.all([
      getDoc(doc(db, SETTINGS_COLLECTION, "notifications")),
      getDoc(doc(db, SETTINGS_COLLECTION, "applicationForm"))
    ]);
    const emails = (notifSnap.exists() && Array.isArray(notifSnap.data().emails) && notifSnap.data().emails.length)
      ? notifSnap.data().emails
      : HR_NOTIFY_EMAILS;
    $("notify-emails").value = emails.join("\n");

    formFields = (formSnap.exists() && Array.isArray(formSnap.data().fields))
      ? formSnap.data().fields
      : structuredClone(DEFAULT_FORM_FIELDS);
    renderFormFields();
  } catch (err){
    console.error(err);
    setStatus($("notify-status"), "โหลดการตั้งค่าไม่สำเร็จ: " + err.message, "err");
  }
}

/* ---------- อีเมลแจ้งเตือน ---------- */
$("notify-form").addEventListener("submit", async e => {
  e.preventDefault();
  const emails = $("notify-emails").value
    .split("\n").map(s => s.trim()).filter(Boolean);
  const bad = emails.find(em => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em));
  if(bad){
    setStatus($("notify-status"), `รูปแบบอีเมลไม่ถูกต้อง: ${bad}`, "err");
    return;
  }
  if(!emails.length){
    setStatus($("notify-status"), "กรุณาใส่อีเมลอย่างน้อย 1 รายการ", "err");
    return;
  }
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, "notifications"), { emails });
    setStatus($("notify-status"), `บันทึกเรียบร้อย (${emails.length} อีเมล) — ใบสมัครใหม่จะแจ้งไปยังอีเมลชุดนี้`, "ok");
  } catch (err){
    console.error(err);
    setStatus($("notify-status"), "บันทึกไม่สำเร็จ: " + err.message, "err");
  }
});

/* ---------- ตัวสร้างฟอร์ม ---------- */
const formFieldsContainer = $("form-fields-container");

function fieldBlockHtml(f, idx, total){
  const typeOpts = FIELD_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === f.type ? "selected" : ""}>${t.label}</option>`).join("");
  const isSelect = f.type === "select";
  return `
    <div class="position-edit-block form-field-block" data-idx="${idx}">
      <div class="position-edit-head">
        <span class="position-edit-label">ช่องกรอกที่ ${idx + 1}</span>
        <div class="field-block-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-ff-move="up" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn btn--ghost btn--sm" data-ff-move="down" ${idx === total - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn btn--danger btn--sm" data-ff-remove>ลบช่องนี้</button>
        </div>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>ชื่อช่อง (แสดงให้ผู้สมัครเห็น) <em>*</em></span>
          <input type="text" class="ff-label" value="${escapeHtml(f.label || "")}" placeholder="เช่น ระดับการศึกษา">
        </label>
        <label class="field">
          <span>ประเภทช่อง</span>
          <select class="ff-type">${typeOpts}</select>
        </label>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>ข้อความตัวอย่างในช่อง (placeholder)</span>
          <input type="text" class="ff-placeholder" value="${escapeHtml(f.placeholder || "")}">
        </label>
        <label class="field field--check">
          <span>&nbsp;</span>
          <label class="check-inline">
            <input type="checkbox" class="ff-required" ${f.required ? "checked" : ""}>
            <span>บังคับกรอก</span>
          </label>
        </label>
      </div>
      <label class="field ff-options-wrap" ${isSelect ? "" : "hidden"}>
        <span>ตัวเลือก (1 บรรทัด = 1 ตัวเลือก) — ใช้กับประเภท "ตัวเลือก" เท่านั้น</span>
        <textarea class="ff-options" rows="3" placeholder="ปริญญาตรี&#10;ปริญญาโท">${escapeHtml((f.options || []).join("\n"))}</textarea>
      </label>
    </div>
  `;
}

function renderFormFields(){
  formFieldsContainer.innerHTML = formFields.length
    ? formFields.map((f, i) => fieldBlockHtml(f, i, formFields.length)).join("")
    : `<div class="admin-empty"><p>ยังไม่มีช่องกรอกเพิ่มเติม</p><p class="admin-empty-sub">ฟอร์มจะเหลือเฉพาะ ชื่อ / อีเมล / เบอร์โทรศัพท์ — กด "+ เพิ่มช่องกรอก" เพื่อเพิ่ม</p></div>`;

  formFieldsContainer.querySelectorAll(".form-field-block").forEach(block => {
    const idx = Number(block.dataset.idx);
    block.querySelector("[data-ff-remove]").addEventListener("click", () => {
      if(!confirm(`ลบช่อง "${formFields[idx].label}" ? (มีผลเมื่อกด "บันทึกฟอร์ม")`)) return;
      collectFormFieldsFromDom();
      formFields.splice(idx, 1);
      renderFormFields();
    });
    block.querySelector('[data-ff-move="up"]').addEventListener("click", () => {
      collectFormFieldsFromDom();
      [formFields[idx - 1], formFields[idx]] = [formFields[idx], formFields[idx - 1]];
      renderFormFields();
    });
    block.querySelector('[data-ff-move="down"]').addEventListener("click", () => {
      collectFormFieldsFromDom();
      [formFields[idx + 1], formFields[idx]] = [formFields[idx], formFields[idx + 1]];
      renderFormFields();
    });
    // แสดง/ซ่อนช่อง "ตัวเลือก" ตามประเภทที่เลือก
    block.querySelector(".ff-type").addEventListener("change", e => {
      block.querySelector(".ff-options-wrap").hidden = e.target.value !== "select";
    });
  });
}

function collectFormFieldsFromDom(){
  const blocks = [...formFieldsContainer.querySelectorAll(".form-field-block")];
  if(!blocks.length) return;
  formFields = blocks.map((block, i) => {
    const existing = formFields[Number(block.dataset.idx)] || {};
    return {
      id: existing.id || "f" + Date.now().toString(36) + i,
      label: block.querySelector(".ff-label").value.trim(),
      type: block.querySelector(".ff-type").value,
      required: block.querySelector(".ff-required").checked,
      placeholder: block.querySelector(".ff-placeholder").value.trim(),
      options: block.querySelector(".ff-options").value
        .split("\n").map(s => s.trim()).filter(Boolean)
    };
  });
}

$("add-form-field-btn").addEventListener("click", () => {
  collectFormFieldsFromDom();
  formFields.push({
    id: "f" + Date.now().toString(36),
    label: "", type: "text", required: false, placeholder: "", options: []
  });
  renderFormFields();
  const blocks = formFieldsContainer.querySelectorAll(".ff-label");
  blocks[blocks.length - 1]?.focus();
});

$("save-form-fields-btn").addEventListener("click", async () => {
  collectFormFieldsFromDom();
  const empty = formFields.find(f => !f.label);
  if(empty){
    setStatus($("form-fields-status"), "ทุกช่องต้องมี \"ชื่อช่อง\" — กรอกให้ครบก่อนบันทึก", "err");
    return;
  }
  const badSelect = formFields.find(f => f.type === "select" && !f.options.length);
  if(badSelect){
    setStatus($("form-fields-status"), `ช่อง "${badSelect.label}" เป็นประเภทตัวเลือก แต่ยังไม่ได้ใส่ตัวเลือก`, "err");
    return;
  }
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, "applicationForm"), { fields: formFields });
    setStatus($("form-fields-status"), `บันทึกฟอร์มเรียบร้อย (${formFields.length} ช่อง) — หน้าเว็บสาธารณะใช้ฟอร์มใหม่ทันที`, "ok");
    renderFormFields();
  } catch (err){
    console.error(err);
    setStatus($("form-fields-status"), "บันทึกไม่สำเร็จ: " + err.message, "err");
  }
});
