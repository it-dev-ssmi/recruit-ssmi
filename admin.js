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
  DEPARTMENTS_COLLECTION, BRANCHES_COLLECTION, SETTINGS_COLLECTION
} from "./firebase-config.js";
import { DEFAULT_DEPARTMENTS } from "./departments-data.js";
import { DEFAULT_BRANCHES } from "./branches-data.js";
import { DEFAULT_FORM_FIELDS, FIELD_TYPES } from "./form-defaults.js";

function genId(prefix){
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

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
  setStatus($("login-status"), "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Firebase — ແກ້ໄຂ firebase-config.js ກ່ອນ (ເບິ່ງ README.md)", "err");
}

onAuthStateChanged(auth, user => {
  if(FIREBASE_NOT_CONFIGURED) return;
  if(user){
    loginView.hidden = true;
    adminView.hidden = false;
    logoutBtn.hidden = false;
    $("admin-email").textContent = user.email || "(ບໍ່ຮູ້ອີເມວ)";
    loadDepartments().then(loadBranches);
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
    setStatus($("login-status"), "ກະລຸນາປ້ອນອີເມວ ແລະ ລະຫັດຜ່ານ", "err");
    return;
  }
  $("login-submit").disabled = true;
  setStatus($("login-status"), "ກຳລັງເຂົ້າສູ່ລະບົບ...");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    setStatus($("login-status"), "");
  } catch (err){
    console.error(err);
    const msg = {
      "auth/invalid-credential": "ອີເມວ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ",
      "auth/user-not-found": "ບໍ່ພົບບັນຊີນີ້ໃນລະບົບ",
      "auth/wrong-password": "ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ",
      "auth/too-many-requests": "ລອງຜິດຫຼາຍຄັ້ງເກີນໄປ ກະລຸນາລໍຖ້າສັກຄູ່ແລ້ວລອງໃໝ່",
      "auth/operation-not-allowed": "ຍັງບໍ່ໄດ້ເປີດໃຊ້ Email/Password ໃນ Firebase Console → Authentication"
    }[err.code] || "ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ: " + err.code;
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
    $("tab-branches").hidden = btn.dataset.tab !== "branches";
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
  listEl.innerHTML = `<p class="admin-loading">ກຳລັງໂຫຼດຂໍ້ມູນພະແນກ...</p>`;
  try {
    const snap = await getDocs(query(collection(db, DEPARTMENTS_COLLECTION), orderBy("order")));
    departments = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    await backfillPositionIds();
    renderDepartmentList();
  } catch (err){
    console.error(err);
    listEl.innerHTML = `<p class="admin-error">ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ: ${escapeHtml(err.message)}</p>`;
  }
}

/* ตำแหน่งเก่าที่บันทึกไว้ก่อนมีระบบสาขาจะยังไม่มี id — เติมให้ครั้งเดียว
   แล้วบันทึกกลับ Firestore เพื่อให้ id คงที่ ใช้อ้างอิงจากสาขาได้ */
async function backfillPositionIds(){
  const updates = [];
  for(const d of departments){
    let changed = false;
    const positions = (d.positions || []).map(p => {
      if(p.id) return p;
      changed = true;
      return { ...p, id: genId("pos") };
    });
    if(changed){
      d.positions = positions;
      updates.push(updateDoc(doc(db, DEPARTMENTS_COLLECTION, d.docId), { positions }));
    }
  }
  if(updates.length){
    try { await Promise.all(updates); }
    catch (err){ console.error("เติม id ตำแหน่งเก่าไม่สำเร็จ:", err); }
  }
}

function renderDepartmentList(){
  const listEl = $("dept-admin-list");
  if(!departments.length){
    listEl.innerHTML = `
      <div class="admin-empty">
        <p>ຍັງບໍ່ມີຂໍ້ມູນພະແນກໃນ Firestore</p>
        <p class="admin-empty-sub">ໜ້າເວັບສາທາລະນະຈະສະແດງຂໍ້ມູນຕັ້ງຕົ້ນ (${DEFAULT_DEPARTMENTS.length} ພະແນກ) ໄປພາງກ່ອນ ຈົນກວ່າຈະມີຂໍ້ມູນແທ້ໃນລະບົບ — ກົດ "+ ເພີ່ມພະແນກການໃໝ່" ດ້ານເທິງເພື່ອເລີ່ມ</p>
      </div>`;
    return;
  }
  listEl.innerHTML = departments.map((d, idx) => `
    <div class="dept-admin-card" data-docid="${escapeHtml(d.docId)}">
      <div class="dept-admin-main">
        <span class="dept-code">${escapeHtml(d.code || "—")}</span>
        <div class="dept-admin-info">
          <h3>${escapeHtml(d.name || "(ບໍ່ມີຊື່)")}</h3>
          <p>${escapeHtml(d.mission || "")}</p>
          <div class="dept-admin-meta">
            <span>ລຳດັບ: ${d.order ?? "-"}</span>
            <span>${(d.responsibilities || []).length} ພາລະກິດ</span>
            <span>ເປີດຮັບ ${(d.positions || []).filter(p => p.open !== false).length} / ${(d.positions || []).length} ຕຳແໜ່ງ</span>
          </div>
        </div>
      </div>
      <div class="dept-admin-actions">
        <button class="btn btn--ghost btn--sm" data-move="up" ${idx === 0 ? "disabled" : ""} title="ເລື່ອນຂຶ້ນ">↑</button>
        <button class="btn btn--ghost btn--sm" data-move="down" ${idx === departments.length - 1 ? "disabled" : ""} title="ເລື່ອນລົງ">↓</button>
        <button class="btn btn--ghost btn--sm" data-action="edit">ແກ້ໄຂ</button>
        <button class="btn btn--danger btn--sm" data-action="delete">ລຶບ</button>
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
    setStatus($("dept-status"), "ສະຫຼັບລຳດັບບໍ່ສຳເລັດ: " + err.message, "err");
  }
}

async function deleteDepartment(docId){
  const d = departments.find(x => x.docId === docId);
  if(!d) return;
  const ok = confirm(`ຢືນຢັນລຶບພະແນກ "${d.name}" ?\n\nຕຳແໜ່ງທັງໝົດ ${(d.positions || []).length} ຕຳແໜ່ງໃນພະແນກນີ້ຈະຖືກລຶບໄປນຳ ແລະ ໜ້າເວັບສາທາລະນະຈະບໍ່ສະແດງພະແນກນີ້ອີກ\n(ໃບສະໝັກເກົ່າທີ່ເຄີຍສົ່ງເຂົ້າມາຈະບໍ່ຖືກລຶບ)`);
  if(!ok) return;
  try {
    await deleteDoc(doc(db, DEPARTMENTS_COLLECTION, docId));
    setStatus($("dept-status"), `ລຶບພະແນກ "${d.name}" ຮຽບຮ້ອຍ`, "ok");
    await loadDepartments();
  } catch (err){
    console.error(err);
    setStatus($("dept-status"), "ລຶບບໍ່ສຳເລັດ: " + err.message, "err");
  }
}

/* ---------- นำเข้าข้อมูลตั้งต้น ---------- */


/* ==========================================================================
   DEPARTMENT MODAL — ฟอร์มเพิ่ม/แก้ไขแผนก + ตัวแก้ไขตำแหน่ง
   ========================================================================== */
const deptOverlay = $("dept-overlay");
const positionsContainer = $("positions-container");

function positionBlockHtml(p = {}){
  const duties = (p.duties || []).join("\n");
  return `
    <div class="position-edit-block" data-pos-id="${escapeHtml(p.id || genId("pos"))}">
      <div class="position-edit-head">
        <span class="position-edit-label">ຕຳແໜ່ງ</span>
        <div class="field-block-actions">
          <label class="check-inline">
            <input type="checkbox" class="pos-open" ${p.open === false ? "" : "checked"}>
            <span>ເປີດຮັບສະໝັກ</span>
          </label>
          <button type="button" class="btn btn--danger btn--sm" data-remove-position>ລຶບຕຳແໜ່ງນີ້</button>
        </div>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>ຊື່ຕຳແໜ່ງ <em>*</em></span>
          <input type="text" class="pos-title" value="${escapeHtml(p.title || "")}" placeholder="ພະນັກງານ...">
        </label>
        <label class="field">
          <span>ປະເພດ</span>
          <input type="text" class="pos-type" value="${escapeHtml(p.type || "ເຕັມເວລາ")}" placeholder="ເຕັມເວລາ / ສັນຍາຈ້າງ">
        </label>
      </div>
      <label class="field">
        <span>ຄຳອະທິບາຍຕຳແໜ່ງ</span>
        <textarea class="pos-description" rows="2">${escapeHtml(p.description || "")}</textarea>
      </label>
      <label class="field">
        <span>ພາລະໜ້າທີ່ໂດຍລະອຽດ (1 ແຖວ = 1 ຂໍ້)</span>
        <textarea class="pos-duties" rows="5">${escapeHtml(duties)}</textarea>
      </label>
    </div>
  `;
}

function addPositionBlock(p){
  positionsContainer.insertAdjacentHTML("beforeend", positionBlockHtml(p));
  const block = positionsContainer.lastElementChild;
  block.querySelector("[data-remove-position]").addEventListener("click", () => {
    if(confirm("ລຶບຕຳແໜ່ງນີ້ອອກຈາກຟອມ? (ຈະມີຜົນເມື່ອກົດບັນທຶກພະແນກ)")) block.remove();
  });
}

$("add-position-btn").addEventListener("click", () => addPositionBlock({}));

function openDeptModal(docId = null){
  const d = docId ? departments.find(x => x.docId === docId) : null;
  $("dept-modal-title").textContent = d ? `ແກ້ໄຂພະແນກ: ${d.name}` : "ເພີ່ມພະແນກໃໝ່";
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
    setStatus($("dept-form-status"), "ກະລຸນາປ້ອນລະຫັດພະແນກ ແລະ ຊື່ພະແນກ", "err");
    return;
  }

  const positions = [...positionsContainer.querySelectorAll(".position-edit-block")].map(block => ({
    id: block.dataset.posId || genId("pos"),
    title: block.querySelector(".pos-title").value.trim(),
    open: block.querySelector(".pos-open").checked,
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
  setStatus($("dept-form-status"), "ກຳລັງບັນທຶກ...");
  try {
    if(docId){
      await setDoc(doc(db, DEPARTMENTS_COLLECTION, docId), data);
    } else {
      await addDoc(collection(db, DEPARTMENTS_COLLECTION), data);
    }
    setStatus($("dept-form-status"), "ບັນທຶກຮຽບຮ້ອຍ", "ok");
    await loadDepartments();
    setTimeout(closeDeptModal, 700);
  } catch (err){
    console.error(err);
    setStatus($("dept-form-status"), "ບັນທຶກບໍ່ສຳເລັດ: " + err.message, "err");
  } finally {
    $("dept-save").disabled = false;
  }
});

/* ==========================================================================
   BRANCHES — สาขา/แขวง: จัดการรายชื่อสาขา และเลือกว่าแต่ละสาขาเปิดรับ
   ตำแหน่งใดบ้าง (อ้างอิง position.id จากชุดตำแหน่งของแผนกต่างๆ ด้านบน)
   ========================================================================== */
let branches = [];

async function loadBranches(){
  const listEl = $("branch-admin-list");
  listEl.innerHTML = `<p class="admin-loading">ກຳລັງໂຫຼດຂໍ້ມູນສາຂາ...</p>`;
  try {
    const snap = await getDocs(query(collection(db, BRANCHES_COLLECTION), orderBy("order")));
    branches = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    renderBranchList();
  } catch (err){
    console.error(err);
    listEl.innerHTML = `<p class="admin-error">ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ: ${escapeHtml(err.message)}</p>`;
  }
}

function renderBranchList(){
  const listEl = $("branch-admin-list");
  if(!branches.length){
    listEl.innerHTML = `
      <div class="admin-empty">
        <p>ຍັງບໍ່ມີຂໍ້ມູນສາຂາໃນ Firestore</p>
        <p class="admin-empty-sub">ໜ້າເວັບສາທາລະນະຈະສະແດງຂໍ້ມູນຕັ້ງຕົ້ນ (${DEFAULT_BRANCHES.length} ສາຂາ) ໄປພາງກ່ອນ ຈົນກວ່າຈະມີຂໍ້ມູນແທ້ໃນລະບົບ — ກົດ "+ ເພີ່ມສາຂາໃໝ່" ດ້ານເທິງເພື່ອເລີ່ມ</p>
      </div>`;
    return;
  }
  listEl.innerHTML = branches.map((b, idx) => `
    <div class="dept-admin-card" data-docid="${escapeHtml(b.docId)}">
      <div class="dept-admin-main">
        <span class="dept-code">${escapeHtml(b.code || "—")}</span>
        <div class="dept-admin-info">
          <h3>${escapeHtml(b.name || "(ບໍ່ມີຊື່)")}</h3>
          <div class="dept-admin-meta">
            <span>ລຳດັບ: ${b.order ?? "-"}</span>
            <span>${b.allPositions ? "ເປີດຮັບທຸກຕຳແໜ່ງ" : `${(b.positionIds || []).length} ຕຳແໜ່ງທີ່ເລືອກ`}</span>
          </div>
        </div>
      </div>
      <div class="dept-admin-actions">
        <button class="btn btn--ghost btn--sm" data-move="up" ${idx === 0 ? "disabled" : ""} title="ເລື່ອນຂຶ້ນ">↑</button>
        <button class="btn btn--ghost btn--sm" data-move="down" ${idx === branches.length - 1 ? "disabled" : ""} title="ເລື່ອນລົງ">↓</button>
        <button class="btn btn--ghost btn--sm" data-action="edit">ແກ້ໄຂ</button>
        <button class="btn btn--danger btn--sm" data-action="delete">ລຶບ</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".dept-admin-card").forEach(card => {
    const docId = card.dataset.docid;
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openBranchModal(docId));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteBranch(docId));
    card.querySelector('[data-move="up"]').addEventListener("click", () => moveBranch(docId, -1));
    card.querySelector('[data-move="down"]').addEventListener("click", () => moveBranch(docId, +1));
  });
}

async function moveBranch(docId, dir){
  const idx = branches.findIndex(b => b.docId === docId);
  const swapIdx = idx + dir;
  if(idx < 0 || swapIdx < 0 || swapIdx >= branches.length) return;
  const a = branches[idx], b = branches[swapIdx];
  const orderA = a.order ?? idx + 1, orderB = b.order ?? swapIdx + 1;
  try {
    await Promise.all([
      updateDoc(doc(db, BRANCHES_COLLECTION, a.docId), { order: orderB }),
      updateDoc(doc(db, BRANCHES_COLLECTION, b.docId), { order: orderA })
    ]);
    await loadBranches();
  } catch (err){
    console.error(err);
    setStatus($("branch-status"), "ສະຫຼັບລຳດັບບໍ່ສຳເລັດ: " + err.message, "err");
  }
}

async function deleteBranch(docId){
  const b = branches.find(x => x.docId === docId);
  if(!b) return;
  const ok = confirm(`ຢືນຢັນລຶບສາຂາ "${b.name}" ?\nໜ້າເວັບສາທາລະນະຈະບໍ່ສະແດງແທັບສາຂານີ້ອີກ`);
  if(!ok) return;
  try {
    await deleteDoc(doc(db, BRANCHES_COLLECTION, docId));
    setStatus($("branch-status"), `ລຶບສາຂາ "${b.name}" ຮຽບຮ້ອຍ`, "ok");
    await loadBranches();
  } catch (err){
    console.error(err);
    setStatus($("branch-status"), "ລຶບບໍ່ສຳເລັດ: " + err.message, "err");
  }
}

/* ---------- ตัวเลือกตำแหน่ง (checklist แยกตามพะแนก) ---------- */
function branchPositionsPickerHtml(selectedIds){
  const selected = new Set(selectedIds || []);
  return departments.map(d => {
    const positions = d.positions || [];
    if(!positions.length) return "";
    return `
      <div class="branch-position-group">
        <h5>${escapeHtml(d.name || d.code || "")}</h5>
        <div class="branch-position-list">
          ${positions.map(p => `
            <label class="check-inline">
              <input type="checkbox" class="branch-pos-check" value="${escapeHtml(p.id)}" ${selected.has(p.id) ? "checked" : ""}>
              <span>${escapeHtml(p.title)}${p.open === false ? " (ຍັງບໍ່ເປີດຮັບ)" : ""}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;
  }).join("") || `<p class="admin-empty-sub">ຍັງບໍ່ມີຕຳແໜ່ງໃນລະບົບ — ໄປເພີ່ມຕຳແໜ່ງຈາກແທັບ "ຈັດການພະແນກ" ກ່ອນ</p>`;
}

const branchOverlay = $("branch-overlay");
const branchAllPositionsCheck = $("branch-all-positions");
const branchPositionsWrap = $("branch-positions-wrap");

function updateBranchPositionsWrapState(){
  branchPositionsWrap.classList.toggle("is-disabled", branchAllPositionsCheck.checked);
  branchPositionsWrap.querySelectorAll("input").forEach(el => { el.disabled = branchAllPositionsCheck.checked; });
}
branchAllPositionsCheck.addEventListener("change", updateBranchPositionsWrapState);

function openBranchModal(docId = null){
  const b = docId ? branches.find(x => x.docId === docId) : null;
  $("branch-modal-title").textContent = b ? `ແກ້ໄຂສາຂາ: ${b.name}` : "ເພີ່ມສາຂາໃໝ່";
  $("branch-doc-id").value = b ? b.docId : "";
  $("branch-code").value = b?.code || "";
  $("branch-name").value = b?.name || "";
  $("branch-order").value = b?.order ?? (branches.length + 1);
  branchAllPositionsCheck.checked = !!b?.allPositions;
  $("branch-positions-container").innerHTML = branchPositionsPickerHtml(b?.positionIds);
  updateBranchPositionsWrapState();
  setStatus($("branch-form-status"), "");
  branchOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  $("branch-code").focus();
}

function closeBranchModal(){
  branchOverlay.hidden = true;
  document.body.style.overflow = "";
}

$("add-branch-btn").addEventListener("click", () => openBranchModal(null));
$("branch-close").addEventListener("click", closeBranchModal);
branchOverlay.addEventListener("click", e => { if(e.target === branchOverlay) closeBranchModal(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && !branchOverlay.hidden) closeBranchModal(); });

$("branch-form").addEventListener("submit", async e => {
  e.preventDefault();
  const docId = $("branch-doc-id").value;
  const code = $("branch-code").value.trim();
  const name = $("branch-name").value.trim();
  if(!code || !name){
    setStatus($("branch-form-status"), "ກະລຸນາປ້ອນລະຫັດສາຂາ ແລະ ຊື່ສາຂາ", "err");
    return;
  }

  const allPositions = branchAllPositionsCheck.checked;
  const positionIds = allPositions ? [] : [...$("branch-positions-container").querySelectorAll(".branch-pos-check:checked")].map(el => el.value);

  const data = {
    code: code.toUpperCase(),
    name,
    order: Number($("branch-order").value) || branches.length + 1,
    allPositions,
    positionIds
  };

  $("branch-save").disabled = true;
  setStatus($("branch-form-status"), "ກຳລັງບັນທຶກ...");
  try {
    if(docId){
      await setDoc(doc(db, BRANCHES_COLLECTION, docId), data);
    } else {
      await addDoc(collection(db, BRANCHES_COLLECTION), data);
    }
    setStatus($("branch-form-status"), "ບັນທຶກຮຽບຮ້ອຍ", "ok");
    await loadBranches();
    setTimeout(closeBranchModal, 700);
  } catch (err){
    console.error(err);
    setStatus($("branch-form-status"), "ບັນທຶກບໍ່ສຳເລັດ: " + err.message, "err");
  } finally {
    $("branch-save").disabled = false;
  }
});

/* ==========================================================================
   APPLICATIONS — ดูใบสมัคร / เปลี่ยนสถานะ / ลบ
   ========================================================================== */
const STATUS_OPTIONS = [
  { value: "new",         label: "ໃໝ່" },
  { value: "reviewing",   label: "ກຳລັງພິຈາລະນາ" },
  { value: "interviewed", label: "ສຳພາດແລ້ວ" },
  { value: "accepted",    label: "ຮັບເຂົ້າເຮັດວຽກ" },
  { value: "rejected",    label: "ບໍ່ຜ່ານ" }
];
let applications = [];

async function loadApplications(){
  const listEl = $("apps-list");
  listEl.innerHTML = `<p class="admin-loading">ກຳລັງໂຫຼດໃບສະໝັກ...</p>`;
  try {
    const snap = await getDocs(query(collection(db, APPLICATIONS_COLLECTION), orderBy("submittedAt", "desc")));
    applications = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    $("app-count").textContent = applications.length ? `(${applications.length})` : "";
    renderApplications();
  } catch (err){
    console.error(err);
    listEl.innerHTML = `<p class="admin-error">ໂຫຼດໃບສະໝັກບໍ່ສຳເລັດ: ${escapeHtml(err.message)}</p>`;
  }
}

function formatDate(ts){
  if(!ts?.toDate) return "-";
  return ts.toDate().toLocaleString("lo-LA", { dateStyle: "medium", timeStyle: "short" });
}


/* คำตอบจากช่องกรอกที่ admin สร้างเอง (schema ใหม่: a.answers = {label: value}) */
function renderAnswers(a){
  const entries = Object.entries(a.answers || {}).filter(([, v]) => v);
  if(!entries.length) return "";
  return `<details class="app-message"><summary>ຂໍ້ມູນເພີ່ມເຕີມ (${entries.length} ລາຍການ)</summary>
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
    links.push(`<a href="${escapeHtml(a.resumeUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">ເປີດເຣຊູເມ (PDF) ↗</a>`);
  }
  if(a.portfolioUrl){
    links.push(`<a href="${escapeHtml(a.portfolioUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">ພອດໂຟລິໂອ ↗</a>`);
  }
  return links.length ? links.join("") : `<span class="app-nolink">ບໍ່ມີໄຟລ໌ແນບ</span>`;
}

function renderApplications(){
  const listEl = $("apps-list");
  if(!applications.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ຍັງບໍ່ມີໃບສະໝັກເຂົ້າມາ</p></div>`;
    return;
  }
  listEl.innerHTML = applications.map(a => `
    <div class="app-card" data-docid="${escapeHtml(a.docId)}">
      <div class="app-card-main">
        <div class="app-card-top">
          <h3>${escapeHtml(a.name)}</h3>
          <span class="app-status app-status--${escapeHtml(a.status || "new")}">${escapeHtml(STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status || "ໃໝ່")}</span>
        </div>
        <p class="app-position">${escapeHtml(a.position)} — ${escapeHtml(a.department)}
          ${a.advanceProfile ? '<span class="app-status" style="background:var(--brass-soft);color:var(--gold-text);margin-left:8px">ຝາກປະຫວັດລ່ວງໜ້າ</span>' : ""}</p>
        <div class="app-meta">
          <span>📧 ${escapeHtml(a.email)}</span>
          <span>📞 ${escapeHtml(a.phone)}</span>
          <span>🕐 ${formatDate(a.submittedAt)}</span>
          ${a.experience ? `<span>ປະສົບການ: ${escapeHtml(a.experience)}</span>` : ""}
        </div>
        ${renderAnswers(a)}
        ${a.coverMessage ? `<details class="app-message"><summary>ຂໍ້ຄວາມຈາກຜູ້ສະໝັກ</summary><p>${escapeHtml(a.coverMessage)}</p></details>` : ""}
        <div class="app-links">
          ${renderAttachmentLinks(a)}
        </div>
      </div>
      <div class="app-card-actions">
        <select class="app-status-select">
          ${STATUS_OPTIONS.map(s => `<option value="${s.value}" ${s.value === (a.status || "new") ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
        <button class="btn btn--danger btn--sm" data-action="delete-app">ລຶບໃບສະໝັກ</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".app-card").forEach(card => {
    const docId = card.dataset.docid;
    card.querySelector(".app-status-select").addEventListener("change", async e => {
      try {
        await updateDoc(doc(db, APPLICATIONS_COLLECTION, docId), { status: e.target.value });
        setStatus($("apps-status"), "ອັບເດດສະຖານະຮຽບຮ້ອຍ", "ok");
        const a = applications.find(x => x.docId === docId);
        if(a) a.status = e.target.value;
        renderApplications();
      } catch (err){
        console.error(err);
        setStatus($("apps-status"), "ອັບເດດບໍ່ສຳເລັດ: " + err.message, "err");
      }
    });
    card.querySelector('[data-action="delete-app"]').addEventListener("click", async () => {
      const a = applications.find(x => x.docId === docId);
      if(!confirm(`ຢືນຢັນລຶບໃບສະໝັກຂອງ "${a?.name}" ?\nໄຟລ໌ເຣຊູເມທີ່ແນບມາ (ຖ້າມີ) ຈະຖືກລຶບໄປນຳ ແລະ ກູ້ຄືນບໍ່ໄດ້`)) return;
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
        setStatus($("apps-status"), "ລຶບໃບສະໝັກຮຽບຮ້ອຍ", "ok");
        await loadApplications();
      } catch (err){
        console.error(err);
        setStatus($("apps-status"), "ລຶບບໍ່ສຳເລັດ: " + err.message, "err");
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
    setStatus($("notify-status"), "ໂຫຼດການຕັ້ງຄ່າບໍ່ສຳເລັດ: " + err.message, "err");
  }
}

/* ---------- อีเมลแจ้งเตือน ---------- */
$("notify-form").addEventListener("submit", async e => {
  e.preventDefault();
  const emails = $("notify-emails").value
    .split("\n").map(s => s.trim()).filter(Boolean);
  const bad = emails.find(em => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em));
  if(bad){
    setStatus($("notify-status"), `ຮູບແບບອີເມວບໍ່ຖືກຕ້ອງ: ${bad}`, "err");
    return;
  }
  if(!emails.length){
    setStatus($("notify-status"), "ກະລຸນາໃສ່ອີເມວຢ່າງໜ້ອຍ 1 ລາຍການ", "err");
    return;
  }
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, "notifications"), { emails });
    setStatus($("notify-status"), `ບັນທຶກຮຽບຮ້ອຍ (${emails.length} ອີເມວ) — ໃບສະໝັກໃໝ່ຈະແຈ້ງໄປຫາອີເມວຊຸດນີ້`, "ok");
  } catch (err){
    console.error(err);
    setStatus($("notify-status"), "ບັນທຶກບໍ່ສຳເລັດ: " + err.message, "err");
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
        <span class="position-edit-label">ຊ່ອງກອກທີ ${idx + 1}</span>
        <div class="field-block-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-ff-move="up" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn btn--ghost btn--sm" data-ff-move="down" ${idx === total - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn btn--danger btn--sm" data-ff-remove>ລຶບຊ່ອງນີ້</button>
        </div>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>ຊື່ຊ່ອງ (ສະແດງໃຫ້ຜູ້ສະໝັກເຫັນ) <em>*</em></span>
          <input type="text" class="ff-label" value="${escapeHtml(f.label || "")}" placeholder="ເຊັ່ນ ລະດັບການສຶກສາ">
        </label>
        <label class="field">
          <span>ປະເພດຊ່ອງ</span>
          <select class="ff-type">${typeOpts}</select>
        </label>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>ຂໍ້ຄວາມຕົວຢ່າງໃນຊ່ອງ (placeholder)</span>
          <input type="text" class="ff-placeholder" value="${escapeHtml(f.placeholder || "")}">
        </label>
        <label class="field field--check">
          <span>&nbsp;</span>
          <label class="check-inline">
            <input type="checkbox" class="ff-required" ${f.required ? "checked" : ""}>
            <span>ບັງຄັບກອກ</span>
          </label>
        </label>
      </div>
      <label class="field ff-options-wrap" ${isSelect ? "" : "hidden"}>
        <span>ຕົວເລືອກ (1 ແຖວ = 1 ຕົວເລືອກ) — ໃຊ້ກັບປະເພດ "ຕົວເລືອກ" ເທົ່ານັ້ນ</span>
        <textarea class="ff-options" rows="3" placeholder="ປະລິນຍາຕີ&#10;ປະລິນຍາໂທ">${escapeHtml((f.options || []).join("\n"))}</textarea>
      </label>
    </div>
  `;
}

function renderFormFields(){
  formFieldsContainer.innerHTML = formFields.length
    ? formFields.map((f, i) => fieldBlockHtml(f, i, formFields.length)).join("")
    : `<div class="admin-empty"><p>ຍັງບໍ່ມີຊ່ອງກອກເພີ່ມເຕີມ</p><p class="admin-empty-sub">ຟອມຈະເຫຼືອສະເພາະ ຊື່ / ອີເມວ / ເບີໂທລະສັບ — ກົດ "+ ເພີ່ມຊ່ອງກອກ" ເພື່ອເພີ່ມ</p></div>`;

  formFieldsContainer.querySelectorAll(".form-field-block").forEach(block => {
    const idx = Number(block.dataset.idx);
    block.querySelector("[data-ff-remove]").addEventListener("click", () => {
      if(!confirm(`ລຶບຊ່ອງ "${formFields[idx].label}" ? (ມີຜົນເມື່ອກົດ "ບັນທຶກຟອມ")`)) return;
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
    setStatus($("form-fields-status"), "ທຸກຊ່ອງຕ້ອງມີ \"ຊື່ຊ່ອງ\" — ກອກໃຫ້ຄົບກ່ອນບັນທຶກ", "err");
    return;
  }
  const badSelect = formFields.find(f => f.type === "select" && !f.options.length);
  if(badSelect){
    setStatus($("form-fields-status"), `ຊ່ອງ "${badSelect.label}" ເປັນປະເພດຕົວເລືອກ ແຕ່ຍັງບໍ່ໄດ້ໃສ່ຕົວເລືອກ`, "err");
    return;
  }
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, "applicationForm"), { fields: formFields });
    setStatus($("form-fields-status"), `ບັນທຶກຟອມຮຽບຮ້ອຍ (${formFields.length} ຊ່ອງ) — ໜ້າເວັບສາທາລະນະໃຊ້ຟອມໃໝ່ທັນທີ`, "ok");
    renderFormFields();
  } catch (err){
    console.error(err);
    setStatus($("form-fields-status"), "ບັນທຶກບໍ່ສຳເລັດ: " + err.message, "err");
  }
});