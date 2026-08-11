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
            <span>${(d.positions || []).length} ຕຳແໜ່ງໃນຄັງ (ໃຊ້ງານ ${(d.positions || []).filter(p => p.active !== false).length})</span>
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
            <input type="checkbox" class="pos-active" ${p.active === false ? "" : "checked"}>
            <span>ໃຊ້ງານຢູ່ (ຕິກອອກ = ເຊື່ອງທຸກສາຂາ)</span>
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
    active: block.querySelector(".pos-active").checked,
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
    await loadBranches();
    setTimeout(closeDeptModal, 700);
  } catch (err){
    console.error(err);
    setStatus($("dept-form-status"), "ບັນທຶກບໍ່ສຳເລັດ: " + err.message, "err");
  } finally {
    $("dept-save").disabled = false;
  }
});

/* ==========================================================================
   BRANCHES — ສາຂາ/ແຂວງ  (ຈັດການແຍກ "ໃຜສາຂາມັນ")
   ແຕ່ລະສາຂາເລືອກເອງວ່າ "ມີ" ຕຳແໜ່ງໃດແດ່ ໂດຍອ້າງອີງ position.id ຈາກຄັງຕຳແໜ່ງ
   ຂອງທັງອົງກອນ (ແທັບ "ຈັດການພະແນກ") ແລ້ວໃສ່ຈຳນວນອັດຕາທີ່ຕ້ອງການຮັບ
     count = 0  →  ສາຂາມີຕຳແໜ່ງນີ້ ແຕ່ຍັງບໍ່ເປີດຮັບ (ຜູ້ສົນໃຈຝາກປະຫວັດໄວ້ໄດ້)
     count ≥ 1  →  ເປີດຮັບ N ອັດຕາ
   ຕຳແໜ່ງທີ່ບໍ່ໄດ້ເພີ່ມໄວ້ໃນສາຂາ = ຈະບໍ່ສະແດງໃນສາຂານັ້ນເລີຍ
   ========================================================================== */
let branches = [];

async function loadBranches(){
  const listEl = $("branch-admin-list");
  listEl.innerHTML = `<p class="admin-loading">ກຳລັງໂຫຼດຂໍ້ມູນສາຂາ...</p>`;
  try {
    const snap = await getDocs(query(collection(db, BRANCHES_COLLECTION), orderBy("order")));
    branches = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    branches.forEach(migrateBranchShape);
    renderBranchList();
  } catch (err){
    console.error(err);
    listEl.innerHTML = `<p class="admin-error">ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ: ${escapeHtml(err.message)}</p>`;
  }
}

/* ຂໍ້ມູນເກົ່າທີ່ເກັບເປັນ positionIds: ["pos1","pos2"] → ແປງເປັນ openings ອັດຕະໂນມັດ
   (ຄ່າເລີ່ມຕົ້ນ count = 0 ໝາຍເຖິງ "ມີຕຳແໜ່ງ ແຕ່ຍັງບໍ່ເປີດຮັບ") */
/* ຂໍ້ມູນເກົ່າທີ່ເກັບເປັນ positionIds: ["pos1","pos2"] → ແປງເປັນ openings ອັດຕະໂນມັດ
   (ຄ່າເລີ່ມຕົ້ນ count = 0 ໝາຍເຖິງ "ມີຕຳແໜ່ງ ແຕ່ຍັງບໍ່ເປີດຮັບ") */
function migrateBranchShape(b){
  if(!Array.isArray(b.openings)){
    b.openings = Array.isArray(b.positionIds)
      ? b.positionIds.map(id => ({ posId: id, count: 0, deadline: "" }))
      : [];
  }
  b.openings = b.openings
    .filter(op => op && op.posId)
    .map(op => ({ 
      posId: op.posId, 
      count: Math.max(0, Number(op.count) || 0),
      deadline: op.deadline || ""  // <-- เพิ่มบรรทัดนี้ เพื่อดึง deadline กลับมาโชว์!
    }));
  return b;
}

/* ---------- ຄັງຕຳແໜ່ງທັງອົງກອນ (ດຶງມາຈາກທຸກພະແນກ) ---------- */
function catalogPositions(){
  const out = [];
  departments.forEach(d => (d.positions || []).forEach(p => {
    if(p.active === false) return;
    out.push({ ...p, deptName: d.name, deptCode: d.code });
  }));
  return out;
}

function findPosition(posId){
  for(const d of departments){
    const p = (d.positions || []).find(x => x.id === posId);
    if(p) return { ...p, deptName: d.name, deptCode: d.code };
  }
  return null;
}

function branchSummaryText(b){
  const ops = b.openings || [];
  const listed = b.allPositions ? catalogPositions().length : ops.length;
  const hiring = ops.filter(o => Number(o.count) > 0).length;
  const seats  = ops.reduce((sum, o) => sum + (Number(o.count) || 0), 0);
  return `ມີ ${listed} ຕຳແໜ່ງ · ເປີດຮັບ ${hiring} ຕຳແໜ່ງ (${seats} ອັດຕາ)`;
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
            <span>${branchSummaryText(b)}</span>
            ${b.allPositions ? `<span>ສະແດງທຸກຕຳແໜ່ງໃນຄັງ</span>` : ""}
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
  const ok = confirm(`ຢືນຢັນລຶບສາຂາ "${b.name}" ?\nໜ້າເວັບສາທາລະນະຈະບໍ່ສະແດງແທັບສາຂານີ້ອີກ\n(ຄັງຕຳແໜ່ງຂອງພະແນກຈະບໍ່ຖືກລຶບ)`);
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

/* ==========================================================================
   BRANCH MODAL — ເລືອກຕຳແໜ່ງທີ່ສາຂານີ້ມີ + ໃສ່ຈຳນວນອັດຕາ
   ========================================================================== */
const branchOverlay = $("branch-overlay");
const branchAllPositionsCheck = $("branch-all-positions");
const branchPositionsContainer = $("branch-positions-container");

/* <option> ຂອງຕຳແໜ່ງ ຈັດກຸ່ມຕາມພະແນກ */
function getPositionOptionsHtml(selectedPosId = ""){
  let html = '<option value="">— ເລືອກຕຳແໜ່ງ —</option>';
  departments.forEach(d => {
    const list = (d.positions || []).filter(p => p.active !== false);
    if(!list.length) return;
    html += `<optgroup label="${escapeHtml(d.name || d.code || "")}">`;
    list.forEach(p => {
      const sel = (p.id === selectedPosId) ? "selected" : "";
      html += `<option value="${escapeHtml(p.id)}" ${sel}>${escapeHtml(p.title)}</option>`;
    });
    html += `</optgroup>`;
  });
  return html;
}

function branchOpeningRowHtml(op = {}){
  const orphan = op.posId && !findPosition(op.posId);
  return `
    <div class="branch-opening-block field-grid" style="align-items:end;margin-bottom:1rem;border-bottom:1px dashed #e2e8f0;padding-bottom:1rem;display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;">
      <label class="field" style="margin-bottom:0;">
        <span>ຕຳແໜ່ງ <em>*</em></span>
        <select class="bo-pos-id">
          ${getPositionOptionsHtml(op.posId)}
          ${orphan ? `<option value="${escapeHtml(op.posId)}" selected>(ຕຳແໜ່ງນີ້ຖືກລຶບອອກຈາກຄັງແລ້ວ)</option>` : ""}
        </select>
      </label>
      <label class="field" style="margin-bottom:0;">
        <span>ຈຳນວນອັດຕາ</span>
        <input type="number" class="bo-count" value="${Math.max(0, Number(op.count) || 0)}" min="0" step="1">
      </label>
      <label class="field" style="margin-bottom:0;">
        <span>ວັນທີປິດຮັບ</span>
        <input type="date" class="bo-deadline" value="${escapeHtml(op.deadline || "")}">
      </label>
      <button type="button" class="btn btn--danger" data-remove-opening style="margin-bottom:2px;">ລຶບ</button>
    </div>
  `;
}

function addOpeningRow(op = {}){
  branchPositionsContainer.insertAdjacentHTML("beforeend", branchOpeningRowHtml(op));
  const block = branchPositionsContainer.lastElementChild;
  block.querySelector("[data-remove-opening]").addEventListener("click", () => {
    block.remove();
    updateBranchOpeningsSummary();
  });
  block.querySelector(".bo-count").addEventListener("input", updateBranchOpeningsSummary);
  block.querySelector(".bo-pos-id").addEventListener("change", updateBranchOpeningsSummary);
  updateBranchOpeningsSummary();
  return block;
}

function currentOpeningsFromDom(){
  const seen = new Set();
  return [...branchPositionsContainer.querySelectorAll(".branch-opening-block")]
    .map(block => ({
      posId: block.querySelector(".bo-pos-id").value,
      count: Math.max(0, Number(block.querySelector(".bo-count").value) || 0),
      deadline: block.querySelector(".bo-deadline").value.trim() // <-- เพิ่มบรรทัดนี้
    }))
    .filter(op => {
      if(!op.posId || seen.has(op.posId)) return false;   // ຕັດຕຳແໜ່ງຊ້ຳ / ຍັງບໍ່ໄດ້ເລືອກ
      seen.add(op.posId);
      return true;
    });
}

function updateBranchOpeningsSummary(){
  const el = $("branch-openings-summary");
  if(!el) return;
  const ops = currentOpeningsFromDom();
  const hiring = ops.filter(o => o.count > 0).length;
  const seats  = ops.reduce((s, o) => s + o.count, 0);
  el.textContent = `ລວມ ${ops.length} ຕຳແໜ່ງ · ເປີດຮັບ ${hiring} ຕຳແໜ່ງ (${seats} ອັດຕາ) · ອີກ ${ops.length - hiring} ຕຳແໜ່ງໄວ້ຝາກປະຫວັດ`;
}

/* ປຸ່ມ "+ ເພີ່ມການເປີດຮັບ" */
$("add-branch-opening-btn").addEventListener("click", () => addOpeningRow({}));

/* ປຸ່ມ "+ ເພີ່ມທຸກຕຳແໜ່ງໃນຄັງ" — ໃສ່ໃຫ້ຄົບທຸກຕຳແໜ່ງດ້ວຍ count = 0 ແລ້ວຄ່ອຍປັບເອງ */
$("add-branch-all-positions-btn")?.addEventListener("click", () => {
  const already = new Set(currentOpeningsFromDom().map(o => o.posId));
  const missing = catalogPositions().filter(p => !already.has(p.id));
  if(!missing.length){
    setStatus($("branch-form-status"), "ຄົບທຸກຕຳແໜ່ງໃນຄັງແລ້ວ", "ok");
    return;
  }
  missing.forEach(p => addOpeningRow({ posId: p.id, count: 0 }));
  setStatus($("branch-form-status"), `ເພີ່ມອີກ ${missing.length} ຕຳແໜ່ງ (ຈຳນວນ = 0) — ປັບຈຳນວນແລ້ວກົດບັນທຶກ`, "ok");
});

function openBranchModal(docId = null){
  const b = docId ? branches.find(x => x.docId === docId) : null;
  $("branch-modal-title").textContent = b ? `ແກ້ໄຂສາຂາ: ${b.name}` : "ເພີ່ມສາຂາໃໝ່";
  $("branch-doc-id").value = b ? b.docId : "";
  $("branch-code").value = b?.code || "";
  $("branch-name").value = b?.name || "";
  $("branch-order").value = b?.order ?? (branches.length + 1);
  branchAllPositionsCheck.checked = !!b?.allPositions;

  branchPositionsContainer.innerHTML = "";
  (b?.openings || []).forEach(op => addOpeningRow(op));
  updateBranchOpeningsSummary();

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

/* ບັນທຶກສາຂາ — ມີ handler ອັນດຽວເທົ່ານັ້ນ (ຢ່າເພີ່ມອັນທີສອງ ຈະທັບກັນເອງ) */
$("branch-form").addEventListener("submit", async e => {
  e.preventDefault();
  const docId = $("branch-doc-id").value;
  const code = $("branch-code").value.trim();
  const name = $("branch-name").value.trim();
  if(!code || !name){
    setStatus($("branch-form-status"), "ກະລຸນາປ້ອນລະຫັດສາຂາ ແລະ ຊື່ສາຂາ", "err");
    return;
  }

  const openings = currentOpeningsFromDom();
  const data = {
    code: code.toUpperCase(),
    name,
    order: Number($("branch-order").value) || branches.length + 1,
    allPositions: branchAllPositionsCheck.checked,
    openings
  };

  $("branch-save").disabled = true;
  setStatus($("branch-form-status"), "ກຳລັງບັນທຶກ...");
  try {
    if(docId){
      await setDoc(doc(db, BRANCHES_COLLECTION, docId), data);
    } else {
      await addDoc(collection(db, BRANCHES_COLLECTION), data);
    }
    const seats = openings.reduce((s, o) => s + o.count, 0);
    setStatus($("branch-form-status"), `ບັນທຶກຮຽບຮ້ອຍ (${openings.length} ຕຳແໜ່ງ · ${seats} ອັດຕາ)`, "ok");
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
const NO_BRANCH = "__none__";   // ໃບສະໝັກເກົ່າທີ່ບໍ່ໄດ້ບັນທຶກສາຂາໄວ້
const appFilters = { branch: "", dept: "", status: "", q: "" };

/* ຊື່ສາຂາ / ພະແນກ ຂອງໃບສະໝັກ (ຮອງຮັບຂໍ້ມູນເກົ່າທີ່ບໍ່ມີຟິວ branch) */
function appBranchKey(a){ return (a.branch || "").trim() || NO_BRANCH; }
function appBranchLabel(a){ return (a.branch || "").trim() || "ບໍ່ໄດ້ລະບຸສາຂາ"; }

function filteredApplications(){
  const q = appFilters.q.trim().toLowerCase();
  return applications.filter(a => {
    if(appFilters.branch && appBranchKey(a) !== appFilters.branch) return false;
    if(appFilters.dept && (a.department || "") !== appFilters.dept) return false;
    if(appFilters.status && (a.status || "new") !== appFilters.status) return false;
    if(q){
      const hay = [a.name, a.email, a.phone, a.position, a.department, a.branch]
        .filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ເຕີມຕົວເລືອກໃນຕົວກອງ ຈາກຂໍ້ມູນຈິງທີ່ມີຢູ່ + ລາຍຊື່ສາຂາໃນລະບົບ */
function renderAppFilterOptions(){
  const branchCounts = new Map();
  const deptCounts = new Map();
  applications.forEach(a => {
    const bk = appBranchKey(a);
    branchCounts.set(bk, (branchCounts.get(bk) || 0) + 1);
    const d = a.department || "";
    if(d) deptCounts.set(d, (deptCounts.get(d) || 0) + 1);
  });
  /* ສາຂາທີ່ມີໃນລະບົບ ແຕ່ຍັງບໍ່ມີໃບສະໝັກ ກໍ່ໃຫ້ເລືອກໄດ້ (ຈະສະແດງ 0) */
  (branches || []).forEach(b => {
    if(b.name && !branchCounts.has(b.name)) branchCounts.set(b.name, 0);
  });

  const branchSel = $("filter-branch");
  branchSel.innerHTML = `<option value="">ທຸກສາຂາ (${applications.length})</option>` +
    [...branchCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => {
        const label = key === NO_BRANCH ? "ບໍ່ໄດ້ລະບຸສາຂາ" : key;
        return `<option value="${escapeHtml(key)}">${escapeHtml(label)} (${n})</option>`;
      }).join("");
  branchSel.value = appFilters.branch;

  const deptSel = $("filter-dept");
  deptSel.innerHTML = `<option value="">ທຸກພະແນກ</option>` +
    [...deptCounts.entries()].sort((a, b) => b[1] - a[1])
      .map(([key, n]) => `<option value="${escapeHtml(key)}">${escapeHtml(key)} (${n})</option>`).join("");
  deptSel.value = appFilters.dept;

  const statusSel = $("filter-status");
  statusSel.innerHTML = `<option value="">ທຸກສະຖານະ</option>` +
    STATUS_OPTIONS.map(o => {
      const n = applications.filter(a => (a.status || "new") === o.value).length;
      return `<option value="${o.value}">${o.label} (${n})</option>`;
    }).join("");
  statusSel.value = appFilters.status;
}


async function loadApplications(){
  const listEl = $("apps-list");
  listEl.innerHTML = `<p class="admin-loading">ກຳລັງໂຫຼດໃບສະໝັກ...</p>`;
  try {
    const snap = await getDocs(query(collection(db, APPLICATIONS_COLLECTION), orderBy("submittedAt", "desc")));
    applications = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    $("app-count").textContent = applications.length ? `(${applications.length})` : "";
    renderAppFilterOptions();
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
  const list = filteredApplications();
  const hasFilter = appFilters.branch || appFilters.dept || appFilters.status || appFilters.q.trim();

  $("apps-filter-summary").textContent = applications.length
    ? `ສະແດງ ${list.length} ຈາກທັງໝົດ ${applications.length} ໃບສະໝັກ`
    : "";

  if(!applications.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ຍັງບໍ່ມີໃບສະໝັກເຂົ້າມາ</p></div>`;
    return;
  }
  if(!list.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ບໍ່ພົບໃບສະໝັກທີ່ກົງກັບຕົວກອງ</p>
      ${hasFilter ? `<p class="admin-empty-sub">ລອງກົດ "ລ້າງຕົວກອງ" ເພື່ອເບິ່ງທັງໝົດ</p>` : ""}</div>`;
    return;
  }
  listEl.innerHTML = list.map(a => `
    <div class="app-card" data-docid="${escapeHtml(a.docId)}">
      <div class="app-card-main">
        <div class="app-card-top">
          <h3>${escapeHtml(a.name)}</h3>
          <span class="app-status app-status--${escapeHtml(a.status || "new")}">${escapeHtml(STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status || "ໃໝ່")}</span>
        </div>
        <p class="app-position">${escapeHtml(a.position)} — ${escapeHtml(a.department)}
          ${a.advanceProfile ? '<span class="app-status" style="background:var(--brass-soft);color:var(--gold-text);margin-left:8px">ຝາກປະຫວັດລ່ວງໜ້າ</span>' : ""}</p>
        <div class="app-meta">
          <span><b>🏢 ສາຂາ: ${escapeHtml(appBranchLabel(a))}</b></span>
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
        renderAppFilterOptions();
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

/* ---------- ຕົວກອງໃບສະໝັກ ---------- */
$("filter-branch").addEventListener("change", e => { appFilters.branch = e.target.value; renderApplications(); });
$("filter-dept").addEventListener("change",   e => { appFilters.dept   = e.target.value; renderApplications(); });
$("filter-status").addEventListener("change", e => { appFilters.status = e.target.value; renderApplications(); });
$("filter-search").addEventListener("input",  e => { appFilters.q      = e.target.value; renderApplications(); });
$("clear-filters-btn").addEventListener("click", () => {
  appFilters.branch = appFilters.dept = appFilters.status = appFilters.q = "";
  $("filter-search").value = "";
  renderAppFilterOptions();
  renderApplications();
});

/* ==========================================================================
   SETTINGS — อีเมลแจ้งเตือน HR + ตัวสร้างฟอร์มสมัครงาน
   เก็บใน Firestore: settings/notifications และ settings/applicationForm
   หน้าเว็บสาธารณะโหลดค่าพวกนี้ไป render ฟอร์ม/ส่งอีเมลโดยอัตโนมัติ
   ========================================================================== */
let formFields = [];

/* ຊ່ອງລະບົບ 3 ຊ່ອງ — ລຶບບໍ່ໄດ້ ແລະ ປ່ຽນປະເພດບໍ່ໄດ້ (Firestore rules ບັງຄັບໄວ້)
   ແຕ່ປ່ຽນຊື່ປ້າຍ 2 ພາສາ / ຈັດລຳດັບ / ປັບຄວາມກວ້າງ / ໃສ່ placeholder ໄດ້ */
const CORE_DEFAULTS = [
  { id: "core_name",  core: "name",  type: "text",  label_la: "ຊື່ ແລະ ນາມສະກຸນ", label_en: "Full name",    width: "half", required: true, placeholder: "" },
  { id: "core_email", core: "email", type: "email", label_la: "ອີເມວ",            label_en: "Email",        width: "half", required: true, placeholder: "" },
  { id: "core_phone", core: "phone", type: "tel",   label_la: "ເບີໂທລະສັບ",       label_en: "Phone number", width: "half", required: true, placeholder: "" }
];
const CORE_TITLE = { name: "ຊື່ ແລະ ນາມສະກຸນ", email: "ອີເມວ", phone: "ເບີໂທລະສັບ" };

/* ປະເພດຊ່ອງ — ຕໍ່ຈາກ form-defaults.js ແລ້ວເພີ່ມ email/tel ຖ້າຍັງບໍ່ມີ */
const ALL_FIELD_TYPES = (() => {
  const list = Array.isArray(FIELD_TYPES) ? [...FIELD_TYPES] : [{ value: "text", label: "ຂໍ້ຄວາມ" }];
  const extra = [
    { value: "email", label: "ອີເມວ" },
    { value: "tel",   label: "ເບີໂທລະສັບ" }
  ];
  extra.forEach(e => { if(!list.some(x => x.value === e.value)) list.push(e); });
  return list;
})();

function normalizeFormFields(fields, legacyCore){
  const list = (Array.isArray(fields) ? fields : []).map(f => ({ ...f }));
  /* ຂໍ້ມູນເກົ່າມີແຕ່ label ດຽວ — ເຕີມ label_la / width / type ໃຫ້ຄົບ */
  list.forEach(f => {
    f.label_la = f.label_la || f.label || "";
    f.label_en = f.label_en || "";
    f.label    = f.label_la;
    f.width    = f.width || "half";
    f.type     = f.type || "text";
  });
  const missing = [];
  CORE_DEFAULTS.forEach(def => {
    const found = list.find(f => f.core === def.core);
    if(found){
      found.id       = found.id || def.id;
      found.type     = def.type;
      found.required = true;
      found.label_la = found.label_la || found.label || def.label_la;
      found.label_en = found.label_en || def.label_en;
      found.width    = found.width || def.width;
    } else {
      missing.push({
        ...def,
        label_la: (legacyCore && legacyCore[def.core + "_la"]) || def.label_la,
        label_en: (legacyCore && legacyCore[def.core + "_en"]) || def.label_en
      });
    }
  });
  return [...missing, ...list];
}

async function loadSettings(){
  if(FIREBASE_NOT_CONFIGURED) return;
  try {
    const [notifSnap, formSnap] = await Promise.all([
      getDoc(doc(db, SETTINGS_COLLECTION, "notifications")),
      getDoc(doc(db, SETTINGS_COLLECTION, "applicationForm"))
    ]);

    const emails = (notifSnap.exists() && Array.isArray(notifSnap.data().emails) && notifSnap.data().emails.length)
      ? notifSnap.data().emails
      : HR_NOTIFY_EMAILS;
    $("notify-emails").value = emails.join("\n");

    formFields = formSnap.exists()
      ? normalizeFormFields(formSnap.data().fields, formSnap.data().coreFields)
      : normalizeFormFields(structuredClone(DEFAULT_FORM_FIELDS));

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

/* ---------- ตัวสร้างฟอร์ม (จัดการทุกช่อง รวมช่องระบบ) ---------- */
const formFieldsContainer = $("form-fields-container");

function fieldBlockHtml(f, idx, total){
  const isCore = !!f.core;
  const typeOpts = ALL_FIELD_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === f.type ? "selected" : ""}>${t.label}</option>`).join("");
  const isSelect = f.type === "select";
  const isFile = f.type === "file" || f.type === "image";
  return `
    <div class="position-edit-block form-field-block" data-idx="${idx}">
      <div class="position-edit-head">
        <span class="position-edit-label">
          ຊ່ອງທີ ${idx + 1}${isCore ? ` · ຊ່ອງລະບົບ (${escapeHtml(CORE_TITLE[f.core] || f.core)})` : ""}
        </span>
        <div class="field-block-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-ff-move="up" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn btn--ghost btn--sm" data-ff-move="down" ${idx === total - 1 ? "disabled" : ""}>↓</button>
          ${isCore
            ? `<span class="form-status">ລຶບບໍ່ໄດ້</span>`
            : `<button type="button" class="btn btn--danger btn--sm" data-ff-remove>ລຶບຊ່ອງນີ້</button>`}
        </div>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>ຊື່ຊ່ອງ (ພາສາລາວ) <em>*</em></span>
          <input type="text" class="ff-label-la" value="${escapeHtml(f.label_la || f.label || "")}">
        </label>
        <label class="field">
          <span>ຊື່ຊ່ອງ (English)</span>
          <input type="text" class="ff-label-en" value="${escapeHtml(f.label_en || "")}">
        </label>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>ປະເພດຊ່ອງ${isCore ? " (ຊ່ອງລະບົບ ປ່ຽນບໍ່ໄດ້)" : ""}</span>
          <select class="ff-type" ${isCore ? "disabled" : ""}>${typeOpts}</select>
        </label>
        <label class="field">
          <span>ຄວາມກວ້າງໃນຟອມ</span>
          <select class="ff-width">
            <option value="half" ${f.width !== "full" ? "selected" : ""}>ເຄິ່ງແຖວ (2 ຊ່ອງຕໍ່ແຖວ)</option>
            <option value="full" ${f.width === "full" ? "selected" : ""}>ເຕັມແຖວ</option>
          </select>
        </label>
      </div>

      <div class="field-grid">
        <label class="field ff-placeholder-wrap" ${isFile || isSelect ? "hidden" : ""}>
          <span>ຂໍ້ຄວາມຕົວຢ່າງໃນຊ່ອງ (placeholder)</span>
          <input type="text" class="ff-placeholder" value="${escapeHtml(f.placeholder || "")}">
        </label>
        <label class="field field--check">
          <span>&nbsp;</span>
          <label class="check-inline">
            <input type="checkbox" class="ff-required" ${f.required ? "checked" : ""} ${isCore ? "disabled" : ""}>
            <span>ບັງຄັບກອກ${isCore ? " (ຊ່ອງລະບົບ ບັງຄັບສະເໝີ)" : ""}</span>
          </label>
        </label>
      </div>

      <label class="field ff-options-wrap" ${isSelect ? "" : "hidden"}>
        <span>ຕົວເລືອກ (1 ແຖວ = 1 ຕົວເລືອກ) — ໃຊ້ກັບປະເພດ "ຕົວເລືອກ" ເທົ່ານັ້ນ</span>
        <textarea class="ff-options" rows="3">${escapeHtml((f.options || []).join("\n"))}</textarea>
      </label>
    </div>
  `;
}

function renderFormFields(){
  formFieldsContainer.innerHTML = formFields.length
    ? formFields.map((f, i) => fieldBlockHtml(f, i, formFields.length)).join("")
    : `<div class="admin-empty"><p>ຍັງບໍ່ມີຊ່ອງກອກ</p></div>`;

  formFieldsContainer.querySelectorAll(".form-field-block").forEach(block => {
    const idx = Number(block.dataset.idx);
    block.querySelector("[data-ff-remove]")?.addEventListener("click", () => {
      const nm = formFields[idx].label_la || formFields[idx].label || "";
      if(!confirm(`ລຶບຊ່ອງ "${nm}" ? (ມີຜົນເມື່ອກົດ "ບັນທຶກຟອມ")`)) return;
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
    // แสดง/ซ่อนช่อง "ตัวเลือก" และ placeholder ตามประเภทที่เลือก
    block.querySelector(".ff-type").addEventListener("change", e => {
      const v = e.target.value;
      block.querySelector(".ff-options-wrap").hidden = v !== "select";
      block.querySelector(".ff-placeholder-wrap").hidden = (v === "select" || v === "file" || v === "image");
    });
  });
}

function collectFormFieldsFromDom(){
  const blocks = [...formFieldsContainer.querySelectorAll(".form-field-block")];
  if(!blocks.length) return;
  const snapshot = formFields;
  formFields = blocks.map((block, i) => {
    const existing = snapshot[Number(block.dataset.idx)] || {};
    const labelLa = block.querySelector(".ff-label-la").value.trim();
    return {
      id: existing.id || "f" + Date.now().toString(36) + i,
      core: existing.core || null,                       // ຊ່ອງລະບົບຮັກສາເຄື່ອງໝາຍໄວ້
      label_la: labelLa,
      label_en: block.querySelector(".ff-label-en").value.trim(),
      label: labelLa,                                    // ເກັບໄວ້ເຜື່ອໂຄດເກົ່າ
      type: existing.core ? existing.type : block.querySelector(".ff-type").value,
      required: existing.core ? true : block.querySelector(".ff-required").checked,
      width: block.querySelector(".ff-width").value,
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
    core: null, label_la: "", label_en: "", label: "",
    type: "text", required: false, width: "half", placeholder: "", options: []
  });
  renderFormFields();
  const blocks = formFieldsContainer.querySelectorAll(".ff-label-la");
  blocks[blocks.length - 1]?.focus();
});

$("save-form-fields-btn").addEventListener("click", async () => {
  collectFormFieldsFromDom();
  formFields = normalizeFormFields(formFields);   // ກັນຊ່ອງລະບົບຫາຍ
  const empty = formFields.find(f => !f.label_la);
  if(empty){
    setStatus($("form-fields-status"), "ທຸກຊ່ອງຕ້ອງມີ \"ຊື່ຊ່ອງ (ພາສາລາວ)\" — ກອກໃຫ້ຄົບກ່ອນບັນທຶກ", "err");
    return;
  }
  const badSelect = formFields.find(f => f.type === "select" && !f.options.length);
  if(badSelect){
    setStatus($("form-fields-status"), `ຊ່ອງ "${badSelect.label_la}" ເປັນປະເພດຕົວເລືອກ ແຕ່ຍັງບໍ່ໄດ້ໃສ່ຕົວເລືອກ`, "err");
    return;
  }
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, "applicationForm"), { fields: formFields }, { merge: true });
    setStatus($("form-fields-status"), `ບັນທຶກຟອມຮຽບຮ້ອຍ (${formFields.length} ຊ່ອງ) — ໜ້າເວັບສາທາລະນະໃຊ້ຟອມໃໝ່ທັນທີ`, "ok");
    renderFormFields();
  } catch (err){
    console.error(err);
    setStatus($("form-fields-status"), "ບັນທຶກບໍ່ສຳເລັດ: " + err.message, "err");
  }
});