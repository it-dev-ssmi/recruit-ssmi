/* ==========================================================================
   INTERVIEWER PAGE — ເບິ່ງໃບສະໝັກຢ່າງດຽວ (read-only)
   ໜ້ານີ້ບໍ່ມີຄຳສັ່ງ update/delete ໃດໆ ແລະ Firestore rules ກໍ່ບລັອກໄວ້ອີກຊັ້ນ
   (ບັນຊີທີ່ມີ staff/{uid}.role == "interviewer" ຈະຂຽນຫຍັງບໍ່ໄດ້ເລີຍ)
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  firebaseConfig, APPLICATIONS_COLLECTION
} from "./firebase-config.js";

const STAFF_COLLECTION = "staff";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
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
   AUTH
   ========================================================================== */
const loginView = $("login-view");
const viewerView = $("viewer-view");
const logoutBtn = $("logout-btn");

if(FIREBASE_NOT_CONFIGURED){
  loginView.hidden = false;
  setStatus($("login-status"), "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Firebase — ແກ້ໄຂ firebase-config.js ກ່ອນ (ເບິ່ງ README.md)", "err");
}

onAuthStateChanged(auth, async user => {
  if(FIREBASE_NOT_CONFIGURED) return;
  if(user){
    loginView.hidden = true;
    viewerView.hidden = false;
    logoutBtn.hidden = false;
    $("viewer-email").textContent = user.email || "(ບໍ່ຮູ້ອີເມວ)";

    /* ອ່ານບົດບາດ (ຖ້າມີ) ເພື່ອສະແດງປ້າຍໃຫ້ຮູ້ວ່າເປັນ admin ຫຼື ຜູ້ສຳພາດ */
    let role = "interviewer";
    try {
      const snap = await getDoc(doc(db, STAFF_COLLECTION, user.uid));
      if(snap.exists() && snap.data().role) role = snap.data().role;
      else role = "admin";   // ບໍ່ມີ staff doc = ບັນຊີເກົ່າ ຖືເປັນ admin
    } catch (err){ /* ອ່ານບໍ່ໄດ້ກໍ່ບໍ່ເປັນຫຍັງ ໜ້ານີ້ອ່ານຢ່າງດຽວຢູ່ແລ້ວ */ }
    $("viewer-role").textContent = role === "admin" ? "ຜູ້ດູແລລະບົບ" : "ຜູ້ສຳພາດ (ອ່ານຢ່າງດຽວ)";

    loadApplications();
  } else {
    loginView.hidden = false;
    viewerView.hidden = true;
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
    setStatus($("login-status"), "ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ: " + err.code, "err");
  } finally {
    $("login-submit").disabled = false;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

/* ==========================================================================
   APPLICATIONS (read-only)
   ========================================================================== */
const STATUS_OPTIONS = [
  { value: "new",         label: "ໃໝ່" },
  { value: "reviewing",   label: "ກຳລັງພິຈາລະນາ" },
  { value: "interviewed", label: "ສຳພາດແລ້ວ" },
  { value: "accepted",    label: "ຮັບເຂົ້າເຮັດວຽກ" },
  { value: "rejected",    label: "ບໍ່ຜ່ານ" }
];

let applications = [];
const NO_BRANCH = "__none__";
const appFilters = { branch: "", dept: "", position: "", status: "", q: "" };

function appBranchKey(a){ return (a.branch || "").trim() || NO_BRANCH; }
function appBranchLabel(a){ return (a.branch || "").trim() || "ບໍ່ໄດ້ລະບຸສາຂາ"; }

async function loadApplications(){
  const listEl = $("apps-list");
  listEl.innerHTML = `<p class="admin-loading">ກຳລັງໂຫຼດໃບສະໝັກ...</p>`;
  try {
    const snap = await getDocs(query(collection(db, APPLICATIONS_COLLECTION), orderBy("submittedAt", "desc")));
    applications = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    renderFilterOptions();
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

function filteredApplications(){
  const q = appFilters.q.trim().toLowerCase();
  return applications.filter(a => {
    if(appFilters.branch && appBranchKey(a) !== appFilters.branch) return false;
    if(appFilters.dept && (a.department || "") !== appFilters.dept) return false;
    if(appFilters.position && (a.position || "") !== appFilters.position) return false;
    if(appFilters.status && (a.status || "new") !== appFilters.status) return false;
    if(q){
      const hay = [a.name, a.email, a.phone, a.position, a.department, a.branch]
        .filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function countBy(getKey){
  const map = new Map();
  applications.forEach(a => {
    const k = getKey(a);
    if(k === "" || k == null) return;
    map.set(k, (map.get(k) || 0) + 1);
  });
  return [...map.entries()].sort((x, y) => y[1] - x[1]);
}

function fillSelect(el, allLabel, entries, selected, labelFor = k => k){
  el.innerHTML = `<option value="">${allLabel}</option>` +
    entries.map(([key, n]) =>
      `<option value="${escapeHtml(key)}">${escapeHtml(labelFor(key))} (${n})</option>`).join("");
  el.value = selected;
}

function renderFilterOptions(){
  fillSelect($("filter-branch"), `ທຸກສາຂາ (${applications.length})`,
    countBy(appBranchKey), appFilters.branch,
    k => k === NO_BRANCH ? "ບໍ່ໄດ້ລະບຸສາຂາ" : k);

  fillSelect($("filter-dept"), "ທຸກພະແນກ",
    countBy(a => a.department || ""), appFilters.dept);

  fillSelect($("filter-position"), "ທຸກຕຳແໜ່ງ",
    countBy(a => a.position || ""), appFilters.position);

  $("filter-status").innerHTML = `<option value="">ທຸກສະຖານະ</option>` +
    STATUS_OPTIONS.map(o => {
      const n = applications.filter(a => (a.status || "new") === o.value).length;
      return `<option value="${o.value}">${o.label} (${n})</option>`;
    }).join("");
  $("filter-status").value = appFilters.status;
}

/* ຄຳຕອບຈາກຊ່ອງກອກທີ່ admin ສ້າງໄວ້ */
function renderAnswers(a){
  const entries = Object.entries(a.answers || {}).filter(([, v]) => v);
  if(!entries.length) return "";
  return `<details class="app-message" open><summary>ຂໍ້ມູນເພີ່ມເຕີມ (${entries.length} ລາຍການ)</summary>
    <dl class="app-answers">${entries.map(([k, v]) =>
      `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>
  </details>`;
}

function renderAttachmentLinks(a){
  const links = [];
  (a.attachments || []).forEach(att => {
    links.push(`<a href="${escapeHtml(att.url)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">${escapeHtml(att.label)} ↗</a>`);
  });
  if(a.resumeUrl && !(a.attachments || []).length){
    links.push(`<a href="${escapeHtml(a.resumeUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">ເປີດເຣຊູເມ (PDF) ↗</a>`);
  }
  return links.length ? links.join("") : `<span class="app-nolink">ບໍ່ມີໄຟລ໌ແນບ</span>`;
}

function renderApplications(){
  const listEl = $("apps-list");
  const list = filteredApplications();

  $("apps-filter-summary").textContent = applications.length
    ? `ສະແດງ ${list.length} ຈາກທັງໝົດ ${applications.length} ໃບສະໝັກ`
    : "";

  if(!applications.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ຍັງບໍ່ມີໃບສະໝັກເຂົ້າມາ</p></div>`;
    return;
  }
  if(!list.length){
    listEl.innerHTML = `<div class="admin-empty"><p>ບໍ່ພົບໃບສະໝັກທີ່ກົງກັບຕົວກອງ</p>
      <p class="admin-empty-sub">ລອງກົດ "ລ້າງຕົວກອງ" ເພື່ອເບິ່ງທັງໝົດ</p></div>`;
    return;
  }

  listEl.innerHTML = list.map(a => `
    <div class="app-card">
      <div class="app-card-main">
        <div class="app-card-top">
          <h3>${escapeHtml(a.name)}</h3>
          <span class="app-status app-status--${escapeHtml(a.status || "new")}">${
            escapeHtml(STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status || "ໃໝ່")}</span>
        </div>
        <p class="app-position">${escapeHtml(a.position)} — ${escapeHtml(a.department)}
          ${a.advanceProfile ? '<span class="app-status" style="background:var(--brass-soft);color:var(--gold-text);margin-left:8px">ຝາກປະຫວັດລ່ວງໜ້າ</span>' : ""}</p>
        <div class="app-meta">
          <span><b>🏢 ສາຂາ: ${escapeHtml(appBranchLabel(a))}</b></span>
          <span>📧 ${escapeHtml(a.email)}</span>
          <span>📞 ${escapeHtml(a.phone)}</span>
          <span>🕐 ${formatDate(a.submittedAt)}</span>
        </div>
        ${renderAnswers(a)}
        ${a.coverMessage ? `<details class="app-message"><summary>ຂໍ້ຄວາມຈາກຜູ້ສະໝັກ</summary><p>${escapeHtml(a.coverMessage)}</p></details>` : ""}
        <div class="app-links">
          ${renderAttachmentLinks(a)}
        </div>
      </div>
    </div>
  `).join("");
}

/* ---------- ຕົວກອງ ---------- */
$("filter-branch").addEventListener("change",   e => { appFilters.branch   = e.target.value; renderApplications(); });
$("filter-dept").addEventListener("change",     e => { appFilters.dept     = e.target.value; renderApplications(); });
$("filter-position").addEventListener("change", e => { appFilters.position = e.target.value; renderApplications(); });
$("filter-status").addEventListener("change",   e => { appFilters.status   = e.target.value; renderApplications(); });
$("filter-search").addEventListener("input",    e => { appFilters.q        = e.target.value; renderApplications(); });

$("clear-filters-btn").addEventListener("click", () => {
  appFilters.branch = appFilters.dept = appFilters.position = appFilters.status = appFilters.q = "";
  $("filter-search").value = "";
  renderFilterOptions();
  renderApplications();
});

$("reload-apps-btn").addEventListener("click", loadApplications);
$("print-btn").addEventListener("click", () => window.print());